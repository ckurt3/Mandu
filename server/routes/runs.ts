import { Router } from 'express';
import { db } from '../db/client.js';
import { projects, tasks, artifacts, gates, agentSessions, workspaces } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { runEMAgent, resolveGate, sendMessageToEM, getProjectCwd } from '../orchestrator/emAgent.js';
import { broadcastToProject } from '../websocket.js';
import { randomUUID } from 'crypto';
import { readSessionMessages, filterSystemMessages, type ParsedMessage } from '../sessionReader.js';

const router = Router();

// List all projects
router.get('/projects', async (_req, res) => {
  try {
    const allProjects = await db.select().from(projects);
    res.json({ projects: allProjects });
  } catch (error) {
    console.error('Failed to list projects:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Create a new project
router.post('/projects', async (req, res) => {
  try {
    const { name, description, workspaceId } = req.body;

    const projectId = randomUUID();
    await db.insert(projects).values({
      id: projectId,
      name,
      description,
      workspaceId: workspaceId || null,
      status: 'idle',
    });

    // Update workspace lastUsedAt if workspaceId provided
    if (workspaceId) {
      await db.update(workspaces)
        .set({ lastUsedAt: new Date() })
        .where(eq(workspaces.id, workspaceId));
    }

    res.json({ projectId, name });
  } catch (error) {
    console.error('Failed to create project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get a project
router.get('/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get tasks for this project
    const projectTasks = await db.select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId));

    res.json({ project, tasks: projectTasks });
  } catch (error) {
    console.error('Failed to get project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Start work on a project (sends message to EM)
router.post('/projects/:projectId/message', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message } = req.body;

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if project is already running
    if (project.status === 'running' || project.status === 'waiting_approval') {
      // Send message to existing EM
      await sendMessageToEM(projectId, message);
      res.json({ success: true, action: 'message_sent' });
    } else {
      // Start new EM session - get workspace path
      const projectCwd = await getProjectCwd(projectId);
      runEMAgent({
        projectId,
        cwd: projectCwd,
        request: message,
      }).catch(err => {
        console.error(`EM Agent failed for project ${projectId}:`, err);
      });

      res.json({ success: true, action: 'em_started' });
    }
  } catch (error) {
    console.error('Failed to send message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Resolve a gate
router.post('/gates/:gateId/resolve', async (req, res) => {
  try {
    const { gateId } = req.params;
    const { status, resolution, notes } = req.body; // status: 'approved' | 'rejected'

    // Get the gate to find its projectId
    const [gate] = await db.select()
      .from(gates)
      .where(eq(gates.id, gateId));

    if (!gate) {
      return res.status(404).json({ error: 'Gate not found' });
    }

    // Update gate in database
    await db.update(gates)
      .set({
        status,
        resolution: JSON.stringify(resolution),
        resolvedAt: new Date(),
      })
      .where(eq(gates.id, gateId));

    // Update project status back to running
    await db.update(projects)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(projects.id, gate.projectId));

    // Notify EM of gate resolution
    resolveGate(gate.projectId, gateId, status as 'approved' | 'rejected', notes);

    // Broadcast gate resolution
    broadcastToProject(gate.projectId, {
      type: 'gate_resolved',
      projectId: gate.projectId,
      gateId,
      status,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to resolve gate:', error);
    res.status(500).json({ error: 'Failed to resolve gate' });
  }
});

// Get artifacts for a project
router.get('/projects/:projectId/artifacts', async (req, res) => {
  try {
    const { projectId } = req.params;

    const projectArtifacts = await db.select()
      .from(artifacts)
      .where(eq(artifacts.projectId, projectId));

    res.json({ artifacts: projectArtifacts });
  } catch (error) {
    console.error('Failed to get artifacts:', error);
    res.status(500).json({ error: 'Failed to get artifacts' });
  }
});

// Get a specific artifact
router.get('/artifacts/:artifactId', async (req, res) => {
  try {
    const { artifactId } = req.params;

    const [artifact] = await db.select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId));

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json({ artifact });
  } catch (error) {
    console.error('Failed to get artifact:', error);
    res.status(500).json({ error: 'Failed to get artifact' });
  }
});

// Get chat history for a project (paginated)
// Returns messages from SDK session files, filtered and sorted
router.get('/project/:projectId/history', async (req, res) => {
  try {
    const { projectId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 250);
    const before = parseInt(req.query.before as string) || 0;

    // Get project and its workspace for cwd
    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectCwd = await getProjectCwd(projectId);

    // Get all agent sessions for this project
    const sessions = await db.select()
      .from(agentSessions)
      .where(eq(agentSessions.projectId, projectId));

    if (sessions.length === 0) {
      return res.json({ messages: [], total: 0, hasMore: false });
    }

    // Collect all messages from SDK session files
    interface HistoryMessage {
      role: 'user' | 'assistant' | 'tool';
      content: string;
      timestamp: number;
      agentType: string;
      projectId: string;
      toolName?: string;
      toolInput?: Record<string, unknown>;
    }

    const allMessages: HistoryMessage[] = [];

    for (const session of sessions) {
      if (!session.sessionData) continue;

      try {
        const data = JSON.parse(session.sessionData);
        const sdkSessionId = data.sessionId;

        if (!sdkSessionId) continue;

        // Read from SDK session file (Strategy A: trust SDK files)
        const messages = await readSessionMessages(projectCwd, sdkSessionId);
        const filtered = filterSystemMessages(messages);

        for (const msg of filtered) {
          allMessages.push({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            agentType: session.agentType,
            projectId,
            toolName: msg.toolName,
            toolInput: msg.toolInput,
          });
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Sort by timestamp
    allMessages.sort((a, b) => a.timestamp - b.timestamp);

    const total = allMessages.length;
    const startIndex = Math.max(0, total - before - limit);
    const endIndex = total - before;
    const paginatedMessages = allMessages.slice(startIndex, endIndex);

    res.json({
      messages: paginatedMessages,
      total,
      hasMore: startIndex > 0,
      startIndex,
    });
  } catch (error) {
    console.error('Failed to get history:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

export default router;
