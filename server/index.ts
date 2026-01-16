import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { db, closeDb } from './db/client.js';
import { projects, gates, artifacts, tasks, timelineEvents } from './db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { setupWebSocket, broadcastToProject, setClientSubscription, sendToClient } from './websocket.js';
import { runEMAgent, sendMessageToEM, resolveGate } from './orchestrator/emAgent.js';
import { recoverInProgressProjects } from './recovery.js';
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
        const projectCwd = msg.cwd || process.cwd();
        const projectDesc = msg.description || '';

        await db.insert(projects).values({
          id: projectId,
          name: msg.name,
          description: projectDesc,
          cwd: projectCwd,
          status: 'idle',
        });

        console.log('Project created:', projectId);

        sendToClient(ws, {
          type: 'project_created',
          projectId,
          name: msg.name,
          description: projectDesc,
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
        const allProjects = await db.select().from(projects);
        sendToClient(ws, {
          type: 'projects_list',
          projects: allProjects.map(p => ({
            _id: p.id,
            name: p.name,
            description: p.description,
            status: p.status,
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
          // Start new EM session
          broadcastToProject(projectId, {
            type: 'project_status',
            projectId,
            status: 'running',
          });

          runEMAgent({
            projectId,
            cwd: project.cwd || process.cwd(),
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

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', database: 'sqlite' });
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
