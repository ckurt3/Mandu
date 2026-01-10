import 'dotenv/config';

// Enable SDK debug logging
process.env.DEBUG_CLAUDE_AGENT_SDK = '1';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createWsHandler, type WsClient } from './wsHandler.js';
import { connectToMongo, closeMongo, getCollections } from './db/mongo.js';
import { getChangeStreamWatcher } from './db/changeStream.js';
import { WorkerAgentManager } from './orchestrator/workerAgent.js';
import { SessionManager } from './sessionManager.js';
import { readSessionHistory } from './sessionHistory.js';
import type { ServerMessage } from '../shared/types.js';
import type { Task, Gate } from './db/models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);

// Track all connected clients
const clients = new Set<WsClient>();

// Global session manager for worker agents (broadcasts to all subscribed clients)
const globalSessionManager = new SessionManager({
  onMessage: (agentId, sdkMessage) => {
    console.log(`[GlobalSession] Message from ${agentId}:`, (sdkMessage as { type: string }).type);
    // Extract projectId from agentId (format: agentType-taskId)
    // We need to find which project this agent belongs to
    const session = globalSessionManager.getSession(agentId);
    const projectId = session?.projectId;

    for (const client of clients) {
      if (projectId && client.subscribedProjects.has(projectId)) {
        if (client.ws.readyState === client.ws.OPEN) {
          // Forward the SDK message handling to the client
          broadcastAgentMessage(client, agentId, sdkMessage);
        }
      }
    }
  },
  onStatus: (agentId, status) => {
    console.log(`[GlobalSession] Status change for ${agentId}: ${status}`);
    const session = globalSessionManager.getSession(agentId);
    const projectId = session?.projectId;

    for (const client of clients) {
      if (projectId && client.subscribedProjects.has(projectId)) {
        if (client.ws.readyState === client.ws.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'agent_status',
            agentId,
            status,
          }));
        }
      }
    }
  },
  onError: (agentId, error) => {
    console.error(`[GlobalSession] ERROR for ${agentId}:`, error.message);
    const session = globalSessionManager.getSession(agentId);
    const projectId = session?.projectId;

    for (const client of clients) {
      if (projectId && client.subscribedProjects.has(projectId)) {
        if (client.ws.readyState === client.ws.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'agent_error',
            agentId,
            error: error.message,
          }));
        }
      }
    }
  },
});

// Global worker manager
const globalWorkerManager = new WorkerAgentManager(globalSessionManager);

// Helper to broadcast SDK messages
function broadcastAgentMessage(client: WsClient, agentId: string, sdkMessage: unknown) {
  const msg = sdkMessage as { type: string; message?: { content: unknown[] }; result?: string; duration_ms?: number; total_cost_usd?: number; num_turns?: number };

  if (msg.type === 'assistant' && msg.message) {
    const content = msg.message.content as Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    const textContent = content
      .filter((block) => block.type === 'text')
      .map((block) => block.text || '')
      .join('');

    if (textContent) {
      client.ws.send(JSON.stringify({
        type: 'agent_message',
        agentId,
        content: textContent,
        isPartial: false,
      }));
    }

    const toolBlocks = content.filter((block) => block.type === 'tool_use');
    for (const block of toolBlocks) {
      client.ws.send(JSON.stringify({
        type: 'agent_tool_use',
        agentId,
        toolName: block.name || '',
        toolInput: block.input || {},
      }));
    }
  } else if (msg.type === 'result') {
    client.ws.send(JSON.stringify({
      type: 'agent_result',
      agentId,
      result: msg.result || '',
      stats: {
        durationMs: msg.duration_ms || 0,
        totalCostUsd: msg.total_cost_usd || 0,
        numTurns: msg.num_turns || 0,
      },
    }));
  }
}

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  const client = createWsHandler(ws);
  clients.add(client);

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(client);
  });
});

// Serve static files from the client build in production
app.use(express.static(join(__dirname, '../client/dist')));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Get session history for an agent
app.get('/api/session/:agentId/history', async (req, res) => {
  try {
    const { agentId } = req.params;
    const collections = getCollections();

    // Look up the session in MongoDB to get sessionId and cwd
    const sessionDoc = await collections.agentSessions.findOne({ agentId });

    if (!sessionDoc || !sessionDoc.sessionId) {
      res.json({ messages: [] });
      return;
    }

    // Read history from disk
    const messages = readSessionHistory(sessionDoc.sessionId, sessionDoc.cwd);
    res.json({ messages });
  } catch (error) {
    console.error('Failed to get session history:', error);
    res.status(500).json({ error: 'Failed to get session history' });
  }
});

// Fallback to index.html for SPA routing (Express 5 syntax)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

// Broadcast change events to subscribed clients and handle task spawning
function setupChangeStreamBroadcast() {
  const watcher = getChangeStreamWatcher();

  watcher.subscribe(async (event) => {
    const message: ServerMessage = {
      type: 'db_change',
      collection: event.collection,
      operation: event.operation,
      documentId: event.documentId,
      document: event.document,
      projectId: event.projectId,
    };

    // Broadcast to clients subscribed to this project
    for (const client of clients) {
      // For project changes, broadcast to all clients
      // For other collections, only broadcast to subscribed clients
      const shouldSend =
        event.collection === 'projects' ||
        (event.projectId && client.subscribedProjects.has(event.projectId));

      if (shouldSend && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }

    // Auto-spawn worker agents when tasks are created
    if (event.collection === 'tasks' && event.operation === 'insert' && event.document) {
      const task = event.document as Task;
      // Don't spawn workers for EM tasks - those are handled by the EM itself
      if (task.assignedAgent !== 'em' && task.status === 'pending') {
        try {
          console.log(`Spawning ${task.assignedAgent} worker for task: ${task.title}`);
          await globalWorkerManager.spawnWorkerForTask(task);
        } catch (error) {
          console.error('Failed to spawn worker for task:', error);
        }
      }
    }

    // Notify EM when a worker task completes
    if (event.collection === 'tasks' && event.operation === 'update' && event.document) {
      const task = event.document as Task;
      // Only notify for completed tasks that weren't assigned to EM
      if (task.status === 'completed' && task.assignedAgent !== 'em' && event.projectId) {
        // Find the client that has the EM for this project and notify it
        for (const client of clients) {
          if (client.subscribedProjects.has(event.projectId)) {
            try {
              const taskTitle = task.title || 'Unknown task';
              const taskResult = task.result || 'No result provided';
              const notificationMessage = `Task completed by ${task.assignedAgent} agent:
**Task**: ${taskTitle}
**Result**: ${taskResult}

Review the work and decide on next steps. You can:
- Create a follow-up task if more work is needed
- Create tasks for other agents (architect, developer, qa, reviewer)
- Ask for human approval via a gate if the work is ready for review`;

              console.log(`Notifying EM for project ${event.projectId} about task completion: ${taskTitle}`);
              await client.emManager.sendMessageToEM(event.projectId, notificationMessage);
            } catch (error) {
              console.error('Failed to notify EM of task completion:', error);
            }
            break; // Only notify once
          }
        }
      }
    }

    // Notify EM when a gate is resolved (approved or changes requested)
    if (event.collection === 'gates' && event.operation === 'update' && event.document) {
      const gate = event.document as Gate;
      // Only notify for resolved gates (not pending)
      if (gate.status !== 'pending' && event.projectId) {
        for (const client of clients) {
          if (client.subscribedProjects.has(event.projectId)) {
            try {
              const gateTitle = gate.title || 'Unknown gate';
              const gateDescription = gate.description || 'No description';
              const reviewerComment = gate.reviewerComment || 'No comment provided';
              const statusText = gate.status === 'approved' ? '✅ APPROVED' : '⚠️ CHANGES REQUESTED';

              const notificationMessage = `Gate resolved:
**Gate**: ${gateTitle}
**Status**: ${statusText}
**Description**: ${gateDescription}
**Reviewer Comment**: ${reviewerComment}

${gate.status === 'approved'
  ? 'The gate was approved. You can now proceed with the next steps in the workflow.'
  : 'Changes were requested. Review the feedback and create appropriate follow-up tasks to address the concerns.'}`;

              console.log(`Notifying EM for project ${event.projectId} about gate resolution: ${gateTitle} - ${gate.status}`);
              await client.emManager.sendMessageToEM(event.projectId, notificationMessage);
            } catch (error) {
              console.error('Failed to notify EM of gate resolution:', error);
            }
            break; // Only notify once
          }
        }
      }
    }
  });
}

// Start server with MongoDB connection
async function start() {
  try {
    await connectToMongo();

    // Start change stream watcher
    const watcher = getChangeStreamWatcher();
    await watcher.start();
    setupChangeStreamBroadcast();

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
  const watcher = getChangeStreamWatcher();
  await watcher.stop();
  await closeMongo();
  process.exit(0);
});

start();
