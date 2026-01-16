import type { EMDecision } from './types.js';

// EM will output structured decisions via tool calls
export const EM_TOOLS = [
  {
    name: 'spawn_worker',
    description: 'Delegate a task to a specialist agent',
    input_schema: {
      type: 'object',
      properties: {
        agentType: {
          type: 'string',
          enum: ['pm', 'architect', 'developer', 'qa', 'reviewer'],
          description: 'The type of agent to spawn',
        },
        taskInput: {
          type: 'object',
          description: 'Input data for the agent (requirements, context, etc.)',
        },
      },
      required: ['agentType', 'taskInput'],
    },
  },
  {
    name: 'create_gate',
    description: 'Request human approval or input',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['approval', 'clarification', 'review'],
        },
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['type', 'title'],
    },
  },
  {
    name: 'complete',
    description: 'Mark the run as successfully completed',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of what was accomplished' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'fail',
    description: 'Mark the run as failed',
    input_schema: {
      type: 'object',
      properties: {
        error: { type: 'string', description: 'Why the run failed' },
      },
      required: ['error'],
    },
  },
];

// EM-specific tools that represent orchestration decisions
const EM_TOOL_NAMES = new Set(['spawn_worker', 'create_gate', 'complete', 'fail']);

export function isEMTool(toolName: string): boolean {
  return EM_TOOL_NAMES.has(toolName);
}

export function parseEMToolCall(toolName: string, toolInput: unknown): EMDecision | null {
  // Skip non-EM tools (Claude Code built-ins like Task, Glob, Grep, etc.)
  if (!isEMTool(toolName)) {
    return null;
  }

  const input = toolInput as Record<string, unknown>;

  switch (toolName) {
    case 'spawn_worker':
      return {
        type: 'spawn_worker',
        agentType: input.agentType as EMDecision['agentType'],
        taskInput: input.taskInput as Record<string, unknown>,
      };
    case 'create_gate':
      return {
        type: 'create_gate',
        gateType: input.type as string,
        gateTitle: input.title as string,
        gateDescription: input.description as string | undefined,
      };
    case 'complete':
      return {
        type: 'complete',
        summary: input.summary as string,
      };
    case 'fail':
      return {
        type: 'fail',
        error: input.error as string,
      };
    default:
      return null;
  }
}
