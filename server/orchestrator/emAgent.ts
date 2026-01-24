import { EventEmitter, on } from 'node:events';
import { query, createSdkMcpServer, tool, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/client.js';
import { tasks, gates, agentSessions, projects, artifacts, workspaces } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { spawnWorkerAgent } from './workerAgent.js';
import { broadcastToProject } from '../websocket.js';
import type { EMDecision, EMEvent, ProjectContext } from './types.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load EM system prompt
const EM_SYSTEM_PROMPT = readFileSync(
  join(__dirname, '../agents/em.md'),
  'utf-8'
);

// Create MCP server with EM orchestration tools
// The onDecision callback captures the decision for later execution
function createEMMcpServer(onDecision: (decision: EMDecision) => void) {
  return createSdkMcpServer({
    name: 'em-orchestration',
    tools: [
      tool(
        'spawn_worker',
        'Delegate a task to a specialist agent. Use this to assign work to team members.',
        {
          agentType: z.enum(['pm', 'architect', 'developer', 'qa', 'reviewer'])
            .describe('The type of agent to spawn'),
          taskInput: z.object({
            request: z.string().describe('What they need to do'),
            context: z.string().optional().describe('Background information'),
            constraints: z.string().optional().describe('Any limitations or requirements'),
            previousWork: z.string().optional().describe('Summary of prior artifacts if relevant'),
          }).passthrough().describe('Input data for the agent'),
        },
        async (args) => {
          console.log('[EM MCP] spawn_worker called:', args.agentType);
          onDecision({
            type: 'spawn_worker',
            agentType: args.agentType as EMDecision['agentType'],
            taskInput: args.taskInput as Record<string, unknown>,
          });
          return {
            content: [{ type: 'text', text: `Spawning ${args.agentType} agent with task. They will report back when complete.` }]
          };
        }
      ),
      tool(
        'create_gate',
        'Request human approval or input before proceeding. Use this when you need sign-off or clarification.',
        {
          type: z.enum(['approval', 'clarification', 'review'])
            .describe('The type of gate'),
          title: z.string().describe('Short title for the gate'),
          description: z.string().optional().describe('Detailed description of what needs to be reviewed/approved'),
        },
        async (args) => {
          console.log('[EM MCP] create_gate called:', args.type, args.title);
          onDecision({
            type: 'create_gate',
            gateType: args.type,
            gateTitle: args.title,
            gateDescription: args.description,
          });
          return {
            content: [{ type: 'text', text: `Gate created: "${args.title}". Waiting for human response.` }]
          };
        }
      ),
      tool(
        'complete',
        'Mark the project as successfully completed. Use this when all work is done.',
        {
          summary: z.string().describe('Summary of what was accomplished'),
        },
        async (args) => {
          console.log('[EM MCP] complete called');
          onDecision({
            type: 'complete',
            summary: args.summary,
          });
          return {
            content: [{ type: 'text', text: `Project completed: ${args.summary}` }]
          };
        }
      ),
      tool(
        'fail',
        'Mark the project as failed. Use this when the work cannot be completed.',
        {
          error: z.string().describe('Why the project failed'),
        },
        async (args) => {
          console.log('[EM MCP] fail called');
          onDecision({
            type: 'fail',
            error: args.error,
          });
          return {
            content: [{ type: 'text', text: `Project failed: ${args.error}` }]
          };
        }
      ),
    ],
  });
}

// Event emitters per project - workers and gates push events here
const projectEmitters = new Map<string, EventEmitter>();

function getEmitter(projectId: string): EventEmitter {
  if (!projectEmitters.has(projectId)) {
    projectEmitters.set(projectId, new EventEmitter());
  }
  return projectEmitters.get(projectId)!;
}

export function pushEvent(projectId: string, event: EMEvent): void {
  getEmitter(projectId).emit('event', event);
}

// Track active sessions - only need SDK session ID, messages are in SDK session files
interface EMSession {
  sessionId?: string;
}

const emSessions = new Map<string, EMSession>();

// Build context from database when starting fresh (no session history)
async function buildProjectContext(projectId: string): Promise<string> {
  try {
    console.log('[EM] Building project context for:', projectId);

    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) return '';

    console.log('[EM] Got project, fetching tasks...');
    const projectTasks = await db.select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId));

    console.log('[EM] Got tasks, fetching artifacts...');
    const projectArtifacts = await db.select()
      .from(artifacts)
      .where(eq(artifacts.projectId, projectId));

    console.log('[EM] Got artifacts, fetching gates...');
    const projectGates = await db.select()
      .from(gates)
      .where(eq(gates.projectId, projectId));

  const parts: string[] = [];

  parts.push(`Project: ${project.name}`);
  parts.push(`Description: ${project.description}`);
  parts.push(`Status: ${project.status}`);

  if (projectTasks.length > 0) {
    parts.push('\nCompleted work:');
    for (const task of projectTasks) {
      const output = task.output ? JSON.parse(task.output) : {};
      parts.push(`- ${task.agentType}: ${task.status}${output.summary ? ` - ${output.summary.slice(0, 200)}` : ''}`);
    }
  }

  if (projectArtifacts.length > 0) {
    parts.push('\nArtifacts created:');
    for (const artifact of projectArtifacts) {
      parts.push(`- ${artifact.type}: ${artifact.title}`);
    }
  }

  if (projectGates.length > 0) {
    const pendingGates = projectGates.filter(g => g.status === 'pending');
    const resolvedGates = projectGates.filter(g => g.status !== 'pending');

    if (resolvedGates.length > 0) {
      parts.push('\nApproval gates (resolved):');
      for (const gate of resolvedGates) {
        parts.push(`- ${gate.title}: ${gate.status}`);
      }
    }

    if (pendingGates.length > 0) {
      parts.push('\nPending gates (awaiting approval):');
      for (const gate of pendingGates) {
        parts.push(`- ${gate.title}: ${gate.type}`);
      }
    }
  }

    console.log('[EM] Project context built successfully');
    return parts.join('\n');
  } catch (error) {
    console.error('[EM] Error building project context:', error);
    return ''; // Return empty on error, don't block the EM
  }
}

function formatEvent(event: EMEvent): string {
  let message: string;
  switch (event.type) {
    case 'user_message':
      message = event.content || '[Empty message]';
      break;
    case 'worker_completed':
      message = `[System] Worker ${event.agentType} (task ${event.taskId}) completed:\n${event.summary || 'Task completed successfully.'}`;
      break;
    case 'worker_failed':
      message = `[System] Worker ${event.agentType} (task ${event.taskId}) failed: ${event.error || 'Unknown error'}`;
      break;
    case 'gate_resolved':
      message = `[System] Gate ${event.gateId} was ${event.status}${event.notes ? `: ${event.notes}` : ''}`;
      break;
    default:
      message = '[Unknown event]';
  }
  // Ensure message is never empty (API rejects empty text content blocks)
  return message.trim() || '[Empty event]';
}

async function runEMTurn(
  context: ProjectContext,
  session: EMSession,
  userMessage: string
): Promise<EMDecision | null> {
  const { projectId } = context;

  // Ensure cwd is valid - SDK treats empty string as root "/"
  const cwd = context.cwd?.trim() || process.cwd();

  // Decision will be captured via MCP tool callback
  let decision: EMDecision | null = null;
  const emMcpServer = createEMMcpServer((d) => {
    decision = d;
  });

  // Build prompt - when resuming, SDK already has history so just send the new message
  // On first turn, include instruction to use tools AND project context from DB
  const isFirstTurn = !session.sessionId;
  let prompt: string;

  if (isFirstTurn) {
    // Load project context from database so EM knows what work has been done
    const projectContext = await buildProjectContext(projectId);
    if (projectContext) {
      prompt = `[Project Context - Previous work on this project]\n${projectContext}\n\n[New Message]\n${userMessage}\n\nDecide what to do next. Use one of the tools: spawn_worker, create_gate, complete, or fail.`;
      console.log('[EM] Including project context from database');
    } else {
      prompt = `${userMessage}\n\nDecide what to do next. Use one of the tools: spawn_worker, create_gate, complete, or fail.`;
    }
  } else {
    prompt = userMessage;
  }

  // Validate prompt is not empty (API rejects empty text content blocks)
  prompt = prompt.trim();
  if (!prompt) {
    console.error('[EM] Warning: Empty prompt detected, using fallback');
    prompt = 'Continue with the next step. Use one of the tools: spawn_worker, create_gate, complete, or fail.';
  }

  try {
    console.log('[EM] Building query, cwd:', cwd, 'isFirstTurn:', isFirstTurn);
    const queryOptions: Parameters<typeof query>[0] = {
      prompt,
      options: {
        cwd,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt: EM_SYSTEM_PROMPT,
        // Disable ALL built-in tools - EM should only orchestrate, not do work directly
        tools: [],
        // Add our custom EM tools via MCP
        mcpServers: {
          'em-orchestration': emMcpServer,
        },
        // Enable streaming for real-time text updates
        includePartialMessages: true,
      },
    };

    // Resume session if available - SDK handles conversation history
    if (session.sessionId) {
      queryOptions.options!.resume = session.sessionId;
      console.log('[EM] Resuming session:', session.sessionId);
    }

    console.log('[EM] Starting SDK query...');
    const queryInstance = query(queryOptions);

    let assistantResponse = '';
    let accumulatedStreamText = '';

    console.log('[EM] Iterating SDK messages...');
    for await (const sdkMessage of queryInstance) {
      console.log('[EM] SDK message type:', sdkMessage.type);

      // Capture session ID
      if ('session_id' in sdkMessage && sdkMessage.session_id) {
        session.sessionId = sdkMessage.session_id;
        console.log('[EM] Got session ID:', session.sessionId);
      }

      // Handle streaming text deltas
      if (sdkMessage.type === 'stream_event') {
        const event = (sdkMessage as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          accumulatedStreamText += event.delta.text;
          // Broadcast accumulated text with isPartial (not persisted)
          broadcastToProject(projectId, {
            type: 'agent_message',
            projectId,
            agentType: 'em',
            message: accumulatedStreamText,
            isPartial: true,
          });
        }
        continue;
      }

      // Handle complete assistant messages
      if (sdkMessage.type === 'assistant' && 'message' in sdkMessage) {
        const content = (sdkMessage.message as { content: unknown[] }).content as Array<{
          type: string;
          text?: string;
          name?: string;
          input?: unknown;
        }>;

        // Extract text content
        for (const block of content) {
          console.log('[EM] Content block type:', block.type);
          if (block.type === 'text' && block.text) {
            console.log('[EM] Got text:', block.text.slice(0, 100));
            assistantResponse += block.text;

            // Broadcast final complete message (persisted)
            broadcastToProject(projectId, {
              type: 'agent_message',
              projectId,
              agentType: 'em',
              message: block.text,
            });
            // Reset accumulated text for next response
            accumulatedStreamText = '';
          }

          // Broadcast tool calls to UI (decision is captured via MCP callback)
          if (block.type === 'tool_use' && block.name && block.input) {
            broadcastToProject(projectId, {
              type: 'agent_message',
              projectId,
              agentType: 'em',
              toolName: block.name,
              toolInput: block.input as Record<string, unknown>,
              toolUseId: (block as { id?: string }).id,
            });
          }
        }
      }

      // Handle tool results (user messages containing tool_result blocks)
      if (sdkMessage.type === 'user' && 'message' in sdkMessage) {
        const content = (sdkMessage.message as { content: unknown[] }).content as Array<{
          type: string;
          tool_use_id?: string;
          content?: string | Array<{ type: string; text?: string }>;
        }>;

        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            let resultText = '';
            if (typeof block.content === 'string') {
              resultText = block.content;
            } else if (Array.isArray(block.content)) {
              resultText = block.content
                .filter(c => c.type === 'text' && c.text)
                .map(c => c.text)
                .join('\n');
            }

            broadcastToProject(projectId, {
              type: 'agent_message',
              projectId,
              agentType: 'em',
              toolUseId: block.tool_use_id,
              toolResult: resultText,
            });
          }
        }
      }
    }

    // Checkpoint session ID to database (messages are in SDK session files)
    await checkpointEMSession(projectId, session);

    return decision;
  } catch (error) {
    console.error('EM turn error:', error);

    // Check if this is an SDK process exit (often indicates corrupted session or API error)
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isProcessExit = errorMessage.includes('process exited with code');
    const isContentBlockError = errorMessage.includes('text content blocks must be non-empty');

    if ((isProcessExit || isContentBlockError) && session.sessionId) {
      console.log('[EM] Session appears corrupted (process exit or API error), clearing session ID');
      // Clear the session so next turn starts fresh
      session.sessionId = undefined;
      await checkpointEMSession(projectId, session);

      // Notify the user
      broadcastToProject(projectId, {
        type: 'agent_message',
        projectId,
        agentType: 'em',
        message: '[System] Session was reset due to an error. Please try again.',
      });
    }

    throw error;
  }
}

async function checkpointEMSession(projectId: string, session: EMSession): Promise<void> {
  // Only store the SDK session ID - messages are in SDK session files
  const sessionData = JSON.stringify({
    sessionId: session.sessionId,
  });

  const existing = await db.select()
    .from(agentSessions)
    .where(eq(agentSessions.projectId, projectId))
    .limit(1);

  if (existing.length > 0 && existing[0].agentType === 'em') {
    await db.update(agentSessions)
      .set({
        sessionData,
        updatedAt: new Date(),
      })
      .where(eq(agentSessions.id, existing[0].id));
  } else {
    await db.insert(agentSessions).values({
      id: randomUUID(),
      projectId,
      agentType: 'em',
      sessionData,
      status: 'active',
    });
  }
}

async function loadEMSession(projectId: string): Promise<EMSession | null> {
  const sessions = await db.select()
    .from(agentSessions)
    .where(eq(agentSessions.projectId, projectId));

  const sessionRecord = sessions.find(s => s.agentType === 'em');

  if (!sessionRecord?.sessionData) return null;

  try {
    const data = JSON.parse(sessionRecord.sessionData);
    return {
      sessionId: data.sessionId,
    };
  } catch {
    return null;
  }
}

async function executeDecision(context: ProjectContext, decision: EMDecision): Promise<boolean> {
  const { projectId } = context;

  // Ensure cwd is valid - SDK treats empty string as root "/"
  const cwd = context.cwd?.trim() || process.cwd();

  switch (decision.type) {
    case 'spawn_worker': {
      const taskId = randomUUID();

      // Record task
      await db.insert(tasks).values({
        id: taskId,
        projectId,
        agentType: decision.agentType!,
        title: `${decision.agentType} task`,
        input: JSON.stringify(decision.taskInput),
        status: 'running',
      });

      broadcastToProject(projectId, {
        type: 'task_started',
        projectId,
        taskId,
        agentType: decision.agentType,
      });

      // Signal that EM is now waiting for worker (not actively thinking)
      broadcastToProject(projectId, {
        type: 'em_waiting',
        projectId,
      });

      // Fire-and-forget: spawn worker in background
      spawnWorkerAgent({
        taskId,
        projectId,
        agentType: decision.agentType!,
        input: decision.taskInput!,
        cwd,
        onMessage: (message) => {
          broadcastToProject(projectId, {
            type: 'agent_message',
            projectId,
            taskId,
            agentType: decision.agentType,
            message,
          });
        },
        onComplete: (result) => {
          // Broadcast task completion to clients
          broadcastToProject(projectId, {
            type: result.success ? 'task_completed' : 'task_failed',
            projectId,
            taskId,
            agentType: decision.agentType,
            ...(result.success
              ? { result: result.summary }
              : { error: result.error }),
          });

          // Push completion event to EM
          pushEvent(projectId, {
            type: result.success ? 'worker_completed' : 'worker_failed',
            taskId,
            agentType: decision.agentType!,
            ...(result.success
              ? { summary: result.summary }
              : { error: result.error! }),
          } as EMEvent);
        },
      });

      return true; // Continue loop
    }

    case 'create_gate': {
      const gateId = randomUUID();
      await db.insert(gates).values({
        id: gateId,
        projectId,
        type: decision.gateType!,
        title: decision.gateTitle!,
        description: decision.gateDescription,
        status: 'pending',
      });

      // Update project status to waiting_approval
      await db.update(projects)
        .set({ status: 'waiting_approval', updatedAt: new Date() })
        .where(eq(projects.id, projectId));

      broadcastToProject(projectId, {
        type: 'gate_created',
        projectId,
        gate: {
          id: gateId,
          type: decision.gateType,
          title: decision.gateTitle,
          description: decision.gateDescription,
        },
      });

      // Signal that EM is now waiting for gate approval (not actively thinking)
      broadcastToProject(projectId, {
        type: 'em_waiting',
        projectId,
      });

      // Gate resolution will come as an event when user responds
      return true;
    }

    case 'complete': {
      await db.update(projects)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(projects.id, projectId));

      await db.update(agentSessions)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(agentSessions.projectId, projectId));

      broadcastToProject(projectId, {
        type: 'project_status',
        projectId,
        status: 'completed',
        summary: decision.summary,
      });

      return false; // Exit loop
    }

    case 'fail': {
      await db.update(projects)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(projects.id, projectId));

      broadcastToProject(projectId, {
        type: 'project_status',
        projectId,
        status: 'failed',
        error: decision.error,
      });

      return false; // Exit loop
    }
  }
}

export async function runEMAgent(context: ProjectContext): Promise<void> {
  const { projectId, request } = context;
  console.log('[EM] Starting runEMAgent for project:', projectId);

  const emitter = getEmitter(projectId);

  // Load or create EM session - only tracks SDK session ID
  let session = await loadEMSession(projectId);
  if (!session) {
    session = {};
    console.log('[EM] Created new session');
  } else {
    console.log('[EM] Loaded existing session, SDK ID:', session.sessionId);
  }
  emSessions.set(projectId, session);

  // Update project status
  await db.update(projects)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  broadcastToProject(projectId, {
    type: 'project_status',
    projectId,
    status: 'running',
  });

  try {
    // Initial EM turn to kick things off
    console.log('[EM] Running initial turn with request:', request.slice(0, 100));
    let decision = await runEMTurn(context, session, request);
    console.log('[EM] Initial turn decision:', decision?.type || 'none');

    if (decision) {
      let shouldContinue = await executeDecision(context, decision);
      console.log('[EM] Decision executed, shouldContinue:', shouldContinue);

      if (shouldContinue) {
        // Event loop - EM reacts to events as they arrive
        for await (const [event] of on(emitter, 'event')) {
          const formattedEvent = formatEvent(event as EMEvent);

          // EM decides what to do next
          decision = await runEMTurn(context, session, formattedEvent);

          if (decision) {
            shouldContinue = await executeDecision(context, decision);
            if (!shouldContinue) break;
          }
        }
      }
    }
  } catch (error) {
    console.error(`EM Agent error for project ${projectId}:`, error);
    await db.update(projects)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    broadcastToProject(projectId, {
      type: 'project_status',
      projectId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    // Cleanup
    projectEmitters.delete(projectId);
    emSessions.delete(projectId);
  }
}

// Helper to get project cwd from workspace
export async function getProjectCwd(projectId: string): Promise<string> {
  const result = await db.select({
    workspacePath: workspaces.path,
  })
    .from(projects)
    .leftJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  return result[0]?.workspacePath || process.cwd();
}

// For external calls to send messages to an active EM
export async function sendMessageToEM(projectId: string, message: string): Promise<void> {
  pushEvent(projectId, { type: 'user_message', content: message });
}

// For gate resolution
export async function resolveGate(
  projectId: string,
  gateId: string,
  status: 'approved' | 'rejected',
  notes?: string
): Promise<void> {
  pushEvent(projectId, { type: 'gate_resolved', gateId, status, notes });
}
