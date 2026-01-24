/**
 * Agent Controller - Manages agent lifecycle, pause/resume, and messaging
 *
 * This module provides centralized control over worker agents, including:
 * - Pause/resume functionality using AbortController
 * - Per-agent message queues
 * - TODO state tracking and broadcasting
 */

import { broadcastToProject } from '../websocket.js';
import type { TodoItem } from '../../shared/types.js';

// Agent state tracking
interface AgentState {
  projectId: string;
  taskId: string;
  agentType: string;
  isPaused: boolean;
  abortController: AbortController | null;
  messageQueue: string[];
  todos: TodoItem[];
  // Callback to resume the agent with a message
  resumeCallback: ((message: string) => void) | null;
}

// Map of taskId -> AgentState
const agentStates = new Map<string, AgentState>();

/**
 * Register a new agent when it starts
 */
export function registerAgent(
  projectId: string,
  taskId: string,
  agentType: string
): AbortController {
  const abortController = new AbortController();

  agentStates.set(taskId, {
    projectId,
    taskId,
    agentType,
    isPaused: false,
    abortController,
    messageQueue: [],
    todos: [],
    resumeCallback: null,
  });

  console.log(`[AgentController] Registered agent: ${agentType} (${taskId})`);
  return abortController;
}

/**
 * Unregister an agent when it completes or fails
 */
export function unregisterAgent(taskId: string): void {
  const state = agentStates.get(taskId);
  if (state) {
    // Abort any pending operations
    state.abortController?.abort();
    agentStates.delete(taskId);
    console.log(`[AgentController] Unregistered agent: ${taskId}`);
  }
}

/**
 * Get the current state of an agent
 */
export function getAgentState(taskId: string): AgentState | undefined {
  return agentStates.get(taskId);
}

/**
 * Check if an agent is paused
 */
export function isAgentPaused(taskId: string): boolean {
  return agentStates.get(taskId)?.isPaused ?? false;
}

/**
 * Pause an agent - cancels the current SDK query via AbortController
 * Returns true if successfully paused, false if agent not found or already paused
 */
export function pauseAgent(projectId: string, taskId: string): boolean {
  const state = agentStates.get(taskId);

  if (!state) {
    console.warn(`[AgentController] Cannot pause: agent ${taskId} not found`);
    return false;
  }

  if (state.isPaused) {
    console.warn(`[AgentController] Agent ${taskId} is already paused`);
    return false;
  }

  // Abort the current SDK query
  if (state.abortController) {
    state.abortController.abort();
    console.log(`[AgentController] Aborted SDK query for agent: ${taskId}`);
  }

  state.isPaused = true;

  // Create a new AbortController for when we resume
  state.abortController = new AbortController();

  // Broadcast pause notification
  broadcastToProject(projectId, {
    type: 'agent_paused',
    projectId,
    taskId,
  });

  console.log(`[AgentController] Paused agent: ${state.agentType} (${taskId})`);
  return true;
}

/**
 * Set the resume callback for a paused agent
 * The worker agent calls this when it's ready to wait for resume
 */
export function setResumeCallback(
  taskId: string,
  callback: (message: string) => void
): void {
  const state = agentStates.get(taskId);
  if (state) {
    state.resumeCallback = callback;
  }
}

/**
 * Resume a paused agent
 * If a message is provided, it's sent to the agent
 * If messages were queued while paused, they're sent as well
 * Returns true if successfully resumed, false if agent not found or not paused
 */
export function resumeAgent(
  projectId: string,
  taskId: string,
  message?: string
): boolean {
  const state = agentStates.get(taskId);

  if (!state) {
    console.warn(`[AgentController] Cannot resume: agent ${taskId} not found`);
    return false;
  }

  if (!state.isPaused) {
    console.warn(`[AgentController] Agent ${taskId} is not paused`);
    return false;
  }

  state.isPaused = false;

  // Determine what message to send
  // Priority: explicit message > queued messages > default "Continue"
  let resumeMessage = message || 'Continue';

  if (state.messageQueue.length > 0) {
    // Combine queued messages
    const queuedMessages = state.messageQueue.join('\n\n');
    state.messageQueue = [];

    if (message) {
      resumeMessage = `${queuedMessages}\n\n${message}`;
    } else {
      resumeMessage = queuedMessages;
    }
  }

  // Broadcast resume notification
  broadcastToProject(projectId, {
    type: 'agent_resumed',
    projectId,
    taskId,
  });

  // Call the resume callback if set
  if (state.resumeCallback) {
    state.resumeCallback(resumeMessage);
    state.resumeCallback = null;
  }

  console.log(`[AgentController] Resumed agent: ${state.agentType} (${taskId})`);
  return true;
}

/**
 * Send a message to a specific agent
 * If agent is paused, message is queued for when it resumes
 * Returns true if message was sent/queued, false if agent not found
 */
export function sendMessageToAgent(
  projectId: string,
  taskId: string,
  message: string
): boolean {
  const state = agentStates.get(taskId);

  if (!state) {
    console.warn(`[AgentController] Cannot send message: agent ${taskId} not found`);
    return false;
  }

  if (state.isPaused) {
    // Queue the message for when the agent resumes
    state.messageQueue.push(message);
    console.log(`[AgentController] Queued message for paused agent ${taskId}`);
    return true;
  }

  // Agent is running - we need to inject this into the agent's event loop
  // For now, this returns true but the actual injection needs to happen
  // in the worker agent's message handling
  console.log(`[AgentController] Message sent to running agent ${taskId}`);

  // Store the message in the queue and let the agent pick it up
  state.messageQueue.push(message);

  return true;
}

/**
 * Get and clear any pending messages for an agent
 */
export function getPendingMessages(taskId: string): string[] {
  const state = agentStates.get(taskId);
  if (!state) return [];

  const messages = [...state.messageQueue];
  state.messageQueue = [];
  return messages;
}

/**
 * Update the TODO state for an agent and broadcast to clients
 */
export function updateAgentTodos(
  projectId: string,
  taskId: string,
  agentType: string,
  todos: TodoItem[]
): void {
  const state = agentStates.get(taskId);

  if (state) {
    state.todos = todos;
  }

  // Broadcast TODO update to all clients watching this project
  broadcastToProject(projectId, {
    type: 'agent_todo_update',
    projectId,
    taskId,
    agentType,
    todos,
  });

  console.log(`[AgentController] Updated TODOs for agent ${taskId}: ${todos.length} items`);
}

/**
 * Get the current TODO state for an agent
 */
export function getAgentTodos(taskId: string): TodoItem[] {
  return agentStates.get(taskId)?.todos ?? [];
}

/**
 * Get the AbortController signal for an agent
 * Used by the SDK query to support cancellation
 */
export function getAbortSignal(taskId: string): AbortSignal | undefined {
  return agentStates.get(taskId)?.abortController?.signal;
}

/**
 * List all active agents for a project
 */
export function getProjectAgents(projectId: string): AgentState[] {
  const agents: AgentState[] = [];
  for (const state of agentStates.values()) {
    if (state.projectId === projectId) {
      agents.push(state);
    }
  }
  return agents;
}
