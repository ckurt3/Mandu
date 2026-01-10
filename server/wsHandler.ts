import type { WebSocket } from 'ws';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ObjectId } from 'mongodb';
import { SessionManager } from './sessionManager.js';
import { EMAgentManager } from './orchestrator/emAgent.js';
import { getCollections } from './db/mongo.js';
import type {
  ClientMessage,
  ServerMessage,
  AgentStatus,
} from '../shared/types.js';

// Content block types from Claude API
interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | unknown[];
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | { type: string };

export interface WsClient {
  ws: WebSocket;
  subscribedProjects: Set<string>;
  sessionManager: SessionManager;
  emManager: EMAgentManager;
}

export function createWsHandler(ws: WebSocket): WsClient {
  const subscribedProjects = new Set<string>();
  const send = (message: ServerMessage) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const sessionManager = new SessionManager({
    onMessage: (agentId: string, sdkMessage: SDKMessage) => {
      // Check if this is a replay message (from session resumption)
      const isReplay = 'isReplay' in sdkMessage && sdkMessage.isReplay === true;

      // Handle different SDK message types
      if (sdkMessage.type === 'assistant') {
        // Extract text content from assistant message
        const content = sdkMessage.message.content as ContentBlock[];
        const textBlocks = content.filter((block): block is TextBlock => block.type === 'text');
        const textContent = textBlocks.map((block) => block.text).join('');

        if (textContent) {
          send({
            type: 'agent_message',
            agentId,
            content: textContent,
            isPartial: false,
            isReplay,
          });
        }

        // Extract tool use from assistant message
        const toolUseBlocks = content.filter((block): block is ToolUseBlock => block.type === 'tool_use');

        for (const toolBlock of toolUseBlocks) {
          send({
            type: 'agent_tool_use',
            agentId,
            toolName: toolBlock.name,
            toolInput: toolBlock.input,
            isReplay,
          });
        }
      } else if (sdkMessage.type === 'user') {
        // Check if this is a user text message (replay of original prompt)
        const content = sdkMessage.message.content as ContentBlock[];
        const textBlocks = content.filter((block): block is TextBlock => block.type === 'text');

        if (isReplay && textBlocks.length > 0) {
          // Send replayed user messages to frontend
          const userText = textBlocks.map((b) => b.text).join('');
          if (userText) {
            send({
              type: 'agent_user_message',
              agentId,
              content: userText,
              isReplay: true,
            });
          }
        }

        // User messages contain tool results
        const toolResultBlocks = content.filter((block): block is ToolResultBlock => block.type === 'tool_result');

        for (const resultBlock of toolResultBlocks) {
          const output = typeof resultBlock.content === 'string'
            ? resultBlock.content
            : JSON.stringify(resultBlock.content);

          // Truncate long outputs for display
          const truncatedOutput = output.length > 500
            ? output.slice(0, 500) + '...'
            : output;

          send({
            type: 'agent_tool_result',
            agentId,
            toolName: '', // We don't have the tool name in result
            output: truncatedOutput,
            isReplay,
          });
        }
      } else if (sdkMessage.type === 'result') {
        // Handle both success and error results
        const resultText = 'result' in sdkMessage ? String(sdkMessage.result) : 'Error occurred';
        send({
          type: 'agent_result',
          agentId,
          result: resultText,
          stats: {
            durationMs: sdkMessage.duration_ms,
            totalCostUsd: sdkMessage.total_cost_usd,
            numTurns: sdkMessage.num_turns,
          },
        });
      }
    },

    onStatus: (agentId: string, status: AgentStatus) => {
      send({
        type: 'agent_status',
        agentId,
        status,
      });
    },

    onError: (agentId: string, error: Error) => {
      send({
        type: 'agent_error',
        agentId,
        error: error.message,
      });
    },

    onSessionId: async (agentId: string, sessionId: string, projectId?: string) => {
      // Save sessionId to agentSessions collection for any agent
      try {
        const collections = getCollections();
        const session = sessionManager.getSession(agentId);
        await collections.agentSessions.updateOne(
          { agentId },
          {
            $set: {
              sessionId,
              projectId,
              cwd: session?.cwd || process.cwd(),
              status: 'active',
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error('Failed to save sessionId:', err);
      }
    },
  });

  // Create EM manager for this connection
  const emManager = new EMAgentManager(sessionManager);

  ws.on('message', async (data) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'create_agent':
          sessionManager.createSession(message.agentId, message.cwd);
          send({
            type: 'agent_created',
            agentId: message.agentId,
          });
          break;

        case 'send_message':
          // Fire and forget - responses come through callbacks
          sessionManager.sendMessage(message.agentId, message.message).catch((error) => {
            send({
              type: 'agent_error',
              agentId: message.agentId,
              error: error.message,
            });
          });
          break;

        case 'close_agent':
          sessionManager.closeSession(message.agentId);
          break;

        case 'subscribe_project':
          subscribedProjects.add(message.projectId);
          // Start/resume the EM agent for this project (loads saved session if available)
          try {
            const emAgentId = await emManager.startEMForProject(message.projectId);
            send({
              type: 'project_subscribed',
              projectId: message.projectId,
            });
            // If this is a resumed session, the SDK will replay messages automatically
            // when the first new message is sent
          } catch (err) {
            console.error('Failed to start EM for project:', err);
            send({
              type: 'project_subscribed',
              projectId: message.projectId,
            });
          }

          // Fetch and send existing tasks, gates, and artifacts for this project
          try {
            const collections = getCollections();
            const projectObjId = new ObjectId(message.projectId);

            const [tasks, gates, artifacts] = await Promise.all([
              collections.tasks.find({ projectId: projectObjId }).toArray(),
              collections.gates.find({ projectId: projectObjId }).toArray(),
              collections.artifacts.find({ projectId: projectObjId }).toArray(),
            ]);

            // Send each as a db_change insert event so the client can process them
            for (const task of tasks) {
              send({
                type: 'db_change',
                collection: 'tasks',
                operation: 'insert',
                documentId: task._id!.toString(),
                document: { ...task, _id: task._id!.toString(), projectId: message.projectId },
                projectId: message.projectId,
              });
            }

            for (const gate of gates) {
              send({
                type: 'db_change',
                collection: 'gates',
                operation: 'insert',
                documentId: gate._id!.toString(),
                document: { ...gate, _id: gate._id!.toString(), projectId: message.projectId },
                projectId: message.projectId,
              });
            }

            for (const artifact of artifacts) {
              send({
                type: 'db_change',
                collection: 'artifacts',
                operation: 'insert',
                documentId: artifact._id!.toString(),
                document: { ...artifact, _id: artifact._id!.toString(), projectId: message.projectId },
                projectId: message.projectId,
              });
            }

            console.log(`[WS] Sent ${tasks.length} tasks, ${gates.length} gates, ${artifacts.length} artifacts for project ${message.projectId}`);
          } catch (err) {
            console.error('Failed to fetch project data:', err);
          }
          break;

        case 'unsubscribe_project':
          subscribedProjects.delete(message.projectId);
          break;

        case 'resolve_gate':
          await resolveGate(message.gateId, message.status, message.comment);
          send({
            type: 'gate_resolved',
            gateId: message.gateId,
            status: message.status,
          });
          break;

        case 'create_project':
          try {
            // Default to current working directory if '/' or empty is passed
            const safeCwd = (!message.cwd || message.cwd === '/') ? process.cwd() : message.cwd;
            const project = await createProject(message.name, message.description, safeCwd, message.linearIssueKey);
            const projectId = project._id!.toString();
            const emAgentId = await emManager.startEMForProject(projectId);
            subscribedProjects.add(projectId);
            send({
              type: 'project_created',
              projectId,
              name: project.name,
              emAgentId,
            });
          } catch (err) {
            send({
              type: 'project_error',
              error: err instanceof Error ? err.message : 'Failed to create project',
            });
          }
          break;

        case 'send_project_message':
          try {
            await emManager.sendMessageToEM(message.projectId, message.message);
          } catch (err) {
            send({
              type: 'project_error',
              error: err instanceof Error ? err.message : 'Failed to send message',
            });
          }
          break;

        case 'list_projects':
          try {
            const collections = getCollections();
            const projects = await collections.projects.find({ status: 'active' }).toArray();
            send({
              type: 'projects_list',
              projects: projects.map(p => ({
                _id: p._id!.toString(),
                name: p.name,
                description: p.description,
                status: p.status,
                emAgentId: p.emAgentId,
              })),
            });
          } catch (err) {
            send({
              type: 'project_error',
              error: err instanceof Error ? err.message : 'Failed to list projects',
            });
          }
          break;
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  async function createProject(name: string, description: string, cwd: string, linearIssueKey?: string) {
    const collections = getCollections();
    const now = new Date();
    const project = {
      name,
      description,
      cwd,
      linearIssueKey,
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    };
    const result = await collections.projects.insertOne(project);
    return { ...project, _id: result.insertedId };
  }

  async function resolveGate(
    gateId: string,
    status: 'approved' | 'changes_requested',
    comment?: string
  ): Promise<void> {
    const collections = getCollections();
    await collections.gates.updateOne(
      { _id: new ObjectId(gateId) },
      {
        $set: {
          status,
          reviewerComment: comment,
          resolvedAt: new Date(),
        },
      }
    );
  }

  ws.on('close', () => {
    // Don't destroy sessions on disconnect - they can be resumed
    // Just clear the in-memory state (queryInstance etc)
    // The sessionId is persisted in MongoDB for future resumption
    console.log('WebSocket closed, sessions preserved for resumption');
  });

  return {
    ws,
    subscribedProjects,
    sessionManager,
    emManager,
  };
}
