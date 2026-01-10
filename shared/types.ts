// WebSocket message types between client and server

// Client -> Server messages
export interface CreateAgentMessage {
  type: 'create_agent';
  agentId: string;
  cwd?: string;
}

export interface SendMessageMessage {
  type: 'send_message';
  agentId: string;
  message: string;
}

export interface CloseAgentMessage {
  type: 'close_agent';
  agentId: string;
}

export interface SubscribeProjectMessage {
  type: 'subscribe_project';
  projectId: string;
}

export interface UnsubscribeProjectMessage {
  type: 'unsubscribe_project';
  projectId: string;
}

export interface ResolveGateMessage {
  type: 'resolve_gate';
  gateId: string;
  status: 'approved' | 'changes_requested';
  comment?: string;
}

export interface CreateProjectMessage {
  type: 'create_project';
  name: string;
  description: string;
  cwd: string;
  linearIssueKey?: string;
}

export interface SendProjectMessageMessage {
  type: 'send_project_message';
  projectId: string;
  message: string;
}

export interface ListProjectsMessage {
  type: 'list_projects';
}

export type ClientMessage =
  | CreateAgentMessage
  | SendMessageMessage
  | CloseAgentMessage
  | SubscribeProjectMessage
  | UnsubscribeProjectMessage
  | ResolveGateMessage
  | CreateProjectMessage
  | SendProjectMessageMessage
  | ListProjectsMessage;

// Server -> Client messages
export interface AgentCreatedMessage {
  type: 'agent_created';
  agentId: string;
}

export interface AgentUserMessageReplay {
  type: 'agent_user_message';
  agentId: string;
  content: string;
  isReplay: boolean;
}

export interface AgentMessageMessage {
  type: 'agent_message';
  agentId: string;
  content: string;
  isPartial: boolean;
  isReplay?: boolean;
}

export interface AgentResultMessage {
  type: 'agent_result';
  agentId: string;
  result: string;
  stats: {
    durationMs: number;
    totalCostUsd: number;
    numTurns: number;
  };
}

export interface AgentErrorMessage {
  type: 'agent_error';
  agentId: string;
  error: string;
}

export interface AgentStatusMessage {
  type: 'agent_status';
  agentId: string;
  status: AgentStatus;
}

export interface AgentToolUseMessage {
  type: 'agent_tool_use';
  agentId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  isReplay?: boolean;
}

export interface AgentToolResultMessage {
  type: 'agent_tool_result';
  agentId: string;
  toolName: string;
  output: string;
  isReplay?: boolean;
}

// Database change messages
export interface DbChangeMessage {
  type: 'db_change';
  collection: 'projects' | 'tasks' | 'gates' | 'artifacts';
  operation: 'insert' | 'update' | 'delete' | 'replace';
  documentId: string;
  document?: unknown;
  projectId?: string;
}

export interface ProjectSubscribedMessage {
  type: 'project_subscribed';
  projectId: string;
}

export interface GateResolvedMessage {
  type: 'gate_resolved';
  gateId: string;
  status: 'approved' | 'changes_requested';
}

export interface ProjectCreatedMessage {
  type: 'project_created';
  projectId: string;
  name: string;
  emAgentId: string;
}

export interface ProjectsListMessage {
  type: 'projects_list';
  projects: Array<{
    _id: string;
    name: string;
    description: string;
    status: string;
    emAgentId?: string;
  }>;
}

export interface ProjectErrorMessage {
  type: 'project_error';
  error: string;
}

export interface AgentHistoryMessage {
  type: 'agent_history';
  agentId: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    isToolResult?: boolean;
    timestamp: number;
  }>;
}

export type ServerMessage =
  | AgentCreatedMessage
  | AgentUserMessageReplay
  | AgentMessageMessage
  | AgentResultMessage
  | AgentErrorMessage
  | AgentStatusMessage
  | AgentToolUseMessage
  | AgentToolResultMessage
  | DbChangeMessage
  | ProjectSubscribedMessage
  | GateResolvedMessage
  | ProjectCreatedMessage
  | ProjectsListMessage
  | ProjectErrorMessage
  | AgentHistoryMessage;

// Agent status
export type AgentStatus = 'idle' | 'thinking' | 'error' | 'closed';

// Frontend types
export interface AgentState {
  id: string;
  status: AgentStatus;
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  isPartial?: boolean;
  timestamp: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isToolResult?: boolean;
}
