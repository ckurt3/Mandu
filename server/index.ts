import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { readdir, stat } from 'fs/promises';
import { db, closeDb } from './db/client.js';
import { projects, gates, artifacts, tasks, timelineEvents, workspaces } from './db/schema.js';
import { eq, asc, desc } from 'drizzle-orm';
import { setupWebSocket, broadcastToProject, setClientSubscription, sendToClient } from './websocket.js';
import { runEMAgent, sendMessageToEM, resolveGate, getProjectCwd } from './orchestrator/emAgent.js';
import { recoverInProgressProjects } from './recovery.js';
import { pauseAgent, resumeAgent, sendMessageToAgent } from './orchestrator/agentController.js';
import runsRouter from './routes/runs.js';
import { randomUUID } from 'crypto';
import { validateClientMessage, type ValidatedClientMessage } from './validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);

// Parse JSON bodies
app.use(express.json());

// WebSocket server
const wss = new WebSocketServer({ server });

// Message handler for WebSocket connections
async function handleMessage(ws: WebSocket, message: unknown): Promise<void> {
  // Validate message structure
  const validation = validateClientMessage(message);
  if (!validation.success) {
    console.warn('Invalid WebSocket message:', validation.error);
    sendToClient(ws, {
      type: 'project_error',
      error: `Invalid message: ${validation.error}`,
    });
    return;
  }

  const msg = validation.data;

  try {
    switch (msg.type) {
      case 'subscribe_project': {
        const projectId = msg.projectId;
        setClientSubscription(ws, projectId);

        // Send current project state
        const [project] = await db.select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (project) {
          // Batch queries
          const [allArtifacts, allTasks, projectGates, timeline] = await Promise.all([
            db.select().from(artifacts).where(eq(artifacts.projectId, projectId)),
            db.select().from(tasks).where(eq(tasks.projectId, projectId)),
            db.select().from(gates).where(eq(gates.projectId, projectId)),
            db.select()
              .from(timelineEvents)
              .where(eq(timelineEvents.projectId, projectId))
              .orderBy(asc(timelineEvents.createdAt)),
          ]);

          const pendingGates = projectGates.filter(g => g.status === 'pending');

          // Parse timeline payloads
          const parsedTimeline = timeline.map(e => {
            try {
              return JSON.parse(e.payload);
            } catch {
              return null;
            }
          }).filter(Boolean);

          sendToClient(ws, {
            type: 'project_subscribed',
            projectId,
            project,
            tasks: allTasks,
            pendingGates,
            artifacts: allArtifacts,
            timeline: parsedTimeline,
          });
        }
        break;
      }

      case 'unsubscribe_project': {
        setClientSubscription(ws, null);
        break;
      }

      case 'create_project': {
        console.log('Creating project:', msg.name);
        const projectId = randomUUID();
        const projectDesc = msg.description || '';

        // Get workspace path if workspaceId is provided
        let projectCwd = msg.cwd?.trim() || process.cwd();
        let workspaceName: string | null = null;

        if (msg.workspaceId) {
          const [workspace] = await db.select()
            .from(workspaces)
            .where(eq(workspaces.id, msg.workspaceId));

          if (workspace) {
            projectCwd = workspace.path;
            workspaceName = workspace.name;
            // Update workspace's lastUsedAt timestamp
            await db.update(workspaces)
              .set({ lastUsedAt: new Date() })
              .where(eq(workspaces.id, msg.workspaceId));
          }
        }

        await db.insert(projects).values({
          id: projectId,
          name: msg.name,
          description: projectDesc,
          workspaceId: msg.workspaceId || null,
          status: 'idle',
        });

        console.log('Project created:', projectId);

        sendToClient(ws, {
          type: 'project_created',
          projectId,
          name: msg.name,
          description: projectDesc,
          workspaceId: msg.workspaceId,
          workspaceName,
        });

        // Auto-start the EM with project context as initial request
        let initialRequest: string;

        if (msg.linearIssueKey) {
          initialRequest = `Work on Linear issue: ${msg.linearIssueKey}`;
        } else if (projectDesc) {
          initialRequest = `Project: ${msg.name}\n\n${projectDesc}`;
        } else {
          initialRequest = `Start working on project: ${msg.name}`;
        }

        broadcastToProject(projectId, {
          type: 'project_status',
          projectId,
          status: 'running',
        });

        broadcastToProject(projectId, {
          type: 'agent_message',
          projectId,
          agentType: 'user',
          message: initialRequest,
          isUserMessage: true,
        });

        console.log('Starting EM agent for project:', projectId, 'request:', initialRequest.slice(0, 100));
        runEMAgent({
          projectId,
          cwd: projectCwd,
          request: initialRequest,
        }).then(() => {
          console.log('EM agent completed for project:', projectId);
        }).catch(err => {
          console.error(`EM Agent failed for project ${projectId}:`, err);
        });

        break;
      }

      case 'list_projects': {
        // Join with workspaces to get workspace name, order by updatedAt DESC
        const allProjects = await db.select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          status: projects.status,
          workspaceId: projects.workspaceId,
          workspaceName: workspaces.name,
          updatedAt: projects.updatedAt,
        })
          .from(projects)
          .leftJoin(workspaces, eq(projects.workspaceId, workspaces.id))
          .orderBy(desc(projects.updatedAt));

        sendToClient(ws, {
          type: 'projects_list',
          projects: allProjects.map(p => ({
            _id: p.id,
            name: p.name,
            description: p.description,
            status: p.status,
            workspaceId: p.workspaceId,
            workspaceName: p.workspaceName,
            lastActivityAt: p.updatedAt,
          })),
        });
        break;
      }

      case 'send_project_message': {
        const projectId = msg.projectId;
        const userMessage = msg.message;

        const [project] = await db.select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          sendToClient(ws, {
            type: 'project_error',
            error: 'Project not found',
          });
          break;
        }

        const msgContent = typeof userMessage === 'string'
          ? userMessage
          : userMessage.text || '';

        // Check if project is already running
        if (project.status === 'running' || project.status === 'waiting_approval') {
          // Send message to existing EM
          await sendMessageToEM(projectId, msgContent);
        } else {
          // Start new EM session - get workspace path
          const projectCwd = await getProjectCwd(projectId);

          broadcastToProject(projectId, {
            type: 'project_status',
            projectId,
            status: 'running',
          });

          runEMAgent({
            projectId,
            cwd: projectCwd,
            request: msgContent,
          }).catch(err => {
            console.error(`EM Agent failed for project ${projectId}:`, err);
          });
        }
        break;
      }

      case 'resolve_gate': {
        const gateId = msg.gateId;
        const status = msg.status;
        const comment = msg.comment;

        const [gate] = await db.select()
          .from(gates)
          .where(eq(gates.id, gateId));

        if (!gate) {
          sendToClient(ws, {
            type: 'project_error',
            error: 'Gate not found',
          });
          break;
        }

        await db.update(gates)
          .set({
            status,
            resolution: comment ? JSON.stringify({ comment }) : null,
            resolvedAt: new Date(),
          })
          .where(eq(gates.id, gateId));

        // Update project status back to running
        await db.update(projects)
          .set({ status: 'running', updatedAt: new Date() })
          .where(eq(projects.id, gate.projectId));

        resolveGate(gate.projectId, gateId, status, comment);

        broadcastToProject(gate.projectId, {
          type: 'gate_resolved',
          gateId,
          status,
        });
        break;
      }

      // Workspace handlers
      case 'list_workspaces': {
        const allWorkspaces = await db.select()
          .from(workspaces)
          .orderBy(desc(workspaces.lastUsedAt));

        sendToClient(ws, {
          type: 'workspaces_list',
          workspaces: allWorkspaces.map(w => ({
            id: w.id,
            name: w.name,
            path: w.path,
            createdAt: w.createdAt,
            updatedAt: w.lastUsedAt,
          })),
        });
        break;
      }

      case 'create_workspace': {
        try {
          const workspaceId = randomUUID();
          const now = new Date();

          await db.insert(workspaces).values({
            id: workspaceId,
            name: msg.name,
            path: msg.path,
            lastUsedAt: now,
            createdAt: now,
          });

          const newWorkspace = {
            id: workspaceId,
            name: msg.name,
            path: msg.path,
            createdAt: now,
            updatedAt: now,
          };

          console.log('Workspace created:', workspaceId, msg.name);

          sendToClient(ws, {
            type: 'workspace_created',
            workspace: newWorkspace,
          });
        } catch (err) {
          console.error('Failed to create workspace:', err);
          sendToClient(ws, {
            type: 'workspace_error',
            error: 'Failed to create workspace',
          });
        }
        break;
      }

      case 'delete_workspace': {
        try {
          const workspaceId = msg.workspaceId;

          // ON DELETE CASCADE will handle associated projects
          await db.delete(workspaces)
            .where(eq(workspaces.id, workspaceId));

          console.log('Workspace deleted:', workspaceId);

          sendToClient(ws, {
            type: 'workspace_deleted',
            workspaceId,
          });
        } catch (err) {
          console.error('Failed to delete workspace:', err);
          sendToClient(ws, {
            type: 'workspace_error',
            error: 'Failed to delete workspace',
          });
        }
        break;
      }

      // Agent control handlers
      case 'pause_agent': {
        const success = pauseAgent(msg.projectId, msg.taskId);
        if (!success) {
          sendToClient(ws, {
            type: 'project_error',
            error: 'Failed to pause agent - agent not found or already paused',
          });
        }
        break;
      }

      case 'resume_agent': {
        const success = resumeAgent(msg.projectId, msg.taskId, msg.message);
        if (!success) {
          sendToClient(ws, {
            type: 'project_error',
            error: 'Failed to resume agent - agent not found or not paused',
          });
        }
        break;
      }

      case 'send_agent_message': {
        const success = sendMessageToAgent(msg.projectId, msg.taskId, msg.message);
        if (!success) {
          sendToClient(ws, {
            type: 'project_error',
            error: 'Failed to send message - agent not found',
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error('WebSocket message error:', err);
  }
}

// Set up WebSocket with message handler
setupWebSocket(wss, handleMessage);

// Serve static files from the client build
const clientDistPath = join(process.cwd(), 'client/dist');
app.use(express.static(clientDistPath));

// API routes
app.use('/api', runsRouter);

// Fetch artifact by ID
app.get('/api/artifacts/:id', async (req, res) => {
  try {
    const [artifact] = await db.select()
      .from(artifacts)
      .where(eq(artifacts.id, req.params.id));

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json({ artifact });
  } catch (error) {
    console.error('Error fetching artifact:', error);
    res.status(500).json({ error: 'Failed to fetch artifact' });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', database: 'sqlite' });
});

// Git diff endpoint for a project
app.get('/api/projects/:projectId/diff', async (req, res) => {
  try {
    const projectId = req.params.projectId;

    // Get project's workspace path
    const result = await db.select({
      workspacePath: workspaces.path,
    })
      .from(projects)
      .leftJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .where(eq(projects.id, projectId))
      .limit(1);

    const cwd = result[0]?.workspacePath || process.cwd();

    // Check if this is a git repository
    const { execSync } = await import('child_process');

    try {
      execSync('git rev-parse --git-dir', { cwd, encoding: 'utf-8', stdio: 'pipe' });
    } catch {
      return res.status(400).json({ error: 'Not a git repository' });
    }

    // Get the current branch name
    let currentBranch: string;
    try {
      currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    } catch {
      return res.status(400).json({ error: 'Failed to get current branch' });
    }

    // Determine base branch (main or master)
    let baseBranch = 'main';
    try {
      execSync('git rev-parse --verify main', { cwd, encoding: 'utf-8', stdio: 'pipe' });
    } catch {
      try {
        execSync('git rev-parse --verify master', { cwd, encoding: 'utf-8', stdio: 'pipe' });
        baseBranch = 'master';
      } catch {
        // No main or master, use the merge-base with origin/HEAD or just show uncommitted changes
        baseBranch = 'HEAD~10'; // Fallback to last 10 commits
      }
    }

    // If on the base branch, show uncommitted changes instead
    const compareRef = currentBranch === baseBranch ? 'HEAD' : baseBranch;

    // Get the raw unified diff
    let rawDiff: string;
    try {
      if (currentBranch === baseBranch) {
        // On main/master: show staged + unstaged changes
        rawDiff = execSync('git diff HEAD', { cwd, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
        if (!rawDiff.trim()) {
          // Also check for untracked files by showing them as new files
          const untrackedFiles = execSync('git ls-files --others --exclude-standard', { cwd, encoding: 'utf-8' }).trim();
          if (untrackedFiles) {
            // Include untracked files in the diff
            rawDiff = execSync('git diff HEAD --no-index /dev/null -- ' + untrackedFiles.split('\n').map(f => `"${f}"`).join(' ') + ' 2>/dev/null || true', { cwd, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
          }
        }
      } else {
        // On feature branch: show ALL changes compared to base branch
        // Use single-ref diff to compare working tree to base branch
        // This includes committed changes, staged changes, AND unstaged changes
        rawDiff = execSync(`git diff ${baseBranch}`, { cwd, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });

        // Also include untracked files as new additions
        const untrackedFiles = execSync('git ls-files --others --exclude-standard', { cwd, encoding: 'utf-8' }).trim();
        if (untrackedFiles) {
          // Generate diff for each untracked file individually to avoid command line issues
          for (const file of untrackedFiles.split('\n')) {
            if (file.trim()) {
              try {
                const fileDiff = execSync(`git diff --no-index /dev/null "${file}" 2>/dev/null || true`, { cwd, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
                if (fileDiff.trim()) {
                  rawDiff += '\n' + fileDiff;
                }
              } catch {
                // Ignore errors for individual files
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Git diff error:', error);
      rawDiff = '';
    }

    // Get file statistics
    let filesChanged: Array<{ filename: string; additions: number; deletions: number; status: string }> = [];
    try {
      let statOutput: string;
      if (currentBranch === baseBranch) {
        statOutput = execSync('git diff HEAD --numstat', { cwd, encoding: 'utf-8' });
      } else {
        // Compare working tree to base branch (matches rawDiff command)
        statOutput = execSync(`git diff ${baseBranch} --numstat`, { cwd, encoding: 'utf-8' });
      }

      if (statOutput.trim()) {
        filesChanged = statOutput.trim().split('\n').map(line => {
          const [additions, deletions, filename] = line.split('\t');
          // Handle binary files (shown as -)
          const adds = additions === '-' ? 0 : parseInt(additions, 10);
          const dels = deletions === '-' ? 0 : parseInt(deletions, 10);

          return {
            filename,
            additions: adds,
            deletions: dels,
            status: 'modified' as const, // We'll refine this below
          };
        });
      }

      // Add untracked files to the statistics (for feature branches)
      if (currentBranch !== baseBranch) {
        const untrackedFiles = execSync('git ls-files --others --exclude-standard', { cwd, encoding: 'utf-8' }).trim();
        if (untrackedFiles) {
          for (const file of untrackedFiles.split('\n')) {
            if (file.trim()) {
              try {
                // Count lines in the file for additions
                const lineCount = execSync(`wc -l < "${file}" 2>/dev/null || echo 0`, { cwd, encoding: 'utf-8' }).trim();
                const additions = parseInt(lineCount, 10) || 0;
                filesChanged.push({
                  filename: file,
                  additions,
                  deletions: 0,
                  status: 'added',
                });
              } catch {
                // If we can't count lines, add with 0
                filesChanged.push({
                  filename: file,
                  additions: 0,
                  deletions: 0,
                  status: 'added',
                });
              }
            }
          }
        }
      }

      // Get more detailed status to determine add/delete/modify/rename
      let statusOutput: string;
      if (currentBranch === baseBranch) {
        statusOutput = execSync('git diff HEAD --name-status', { cwd, encoding: 'utf-8' });
      } else {
        // Compare working tree to base branch (matches rawDiff command)
        statusOutput = execSync(`git diff ${baseBranch} --name-status`, { cwd, encoding: 'utf-8' });
      }

      if (statusOutput.trim()) {
        const statusMap = new Map<string, string>();
        for (const line of statusOutput.trim().split('\n')) {
          const [status, ...filenameParts] = line.split('\t');
          const filename = filenameParts.join('\t'); // Handle filenames with tabs
          let normalizedStatus: string;
          switch (status.charAt(0)) {
            case 'A': normalizedStatus = 'added'; break;
            case 'D': normalizedStatus = 'deleted'; break;
            case 'R': normalizedStatus = 'renamed'; break;
            case 'M':
            default: normalizedStatus = 'modified'; break;
          }
          statusMap.set(filename, normalizedStatus);
        }

        // Update file statuses
        filesChanged = filesChanged.map(f => ({
          ...f,
          status: statusMap.get(f.filename) || f.status,
        }));
      }
    } catch (error) {
      console.error('Git stat error:', error);
    }

    // Build the Diff object
    const diff = {
      id: `diff-${projectId}-${Date.now()}`,
      projectId,
      title: currentBranch === baseBranch
        ? 'Working Changes'
        : `${currentBranch} vs ${baseBranch}`,
      description: currentBranch === baseBranch
        ? 'Uncommitted changes in working directory'
        : `Changes on branch ${currentBranch} compared to ${baseBranch}`,
      rawDiff,
      files: filesChanged.map((f, idx) => ({
        id: `file-${idx}`,
        filename: f.filename,
        oldPath: f.status === 'renamed' ? null : f.filename,
        newPath: f.filename,
        status: f.status as 'added' | 'deleted' | 'modified' | 'renamed',
        additions: f.additions,
        deletions: f.deletions,
      })),
      baseRef: currentBranch === baseBranch ? 'HEAD' : baseBranch,
      headRef: currentBranch === baseBranch ? 'Working Tree' : currentBranch,
      createdAt: new Date(),
    };

    res.json({ diff });
  } catch (error) {
    console.error('Error fetching git diff:', error);
    res.status(500).json({ error: 'Failed to fetch git diff' });
  }
});

// Directory browser endpoint for workspace picker
app.get('/api/directories', async (req, res) => {
  try {
    let requestedPath = (req.query.path as string) || '~';

    // Expand ~ to home directory
    if (requestedPath.startsWith('~')) {
      requestedPath = requestedPath.replace(/^~/, homedir());
    }

    // Resolve to absolute path
    const absolutePath = join(requestedPath);

    // Check if path exists and is a directory
    const pathStat = await stat(absolutePath).catch(() => null);
    if (!pathStat || !pathStat.isDirectory()) {
      return res.status(400).json({ error: 'Invalid directory path' });
    }

    // Read directory contents
    const entries = await readdir(absolutePath, { withFileTypes: true });

    // Filter to directories only, exclude hidden folders (starting with .)
    const directories = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        path: join(absolutePath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Get parent directory (if not at root)
    const parentPath = dirname(absolutePath);
    const hasParent = parentPath !== absolutePath;

    // Convert absolute path back to ~ format for display
    const displayPath = absolutePath.replace(homedir(), '~');

    res.json({
      currentPath: absolutePath,
      displayPath,
      parentPath: hasParent ? parentPath : null,
      directories,
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

// Fallback to index.html for SPA routing
app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(clientDistPath, 'index.html'));
});

// Start server
async function start() {
  try {
    console.log('Starting server with SQLite database...');

    // Recover any in-progress projects
    await recoverInProgressProjects();

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`WebSocket server running on ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  closeDb();
  process.exit(0);
});

start();
