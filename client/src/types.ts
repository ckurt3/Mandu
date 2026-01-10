export type AgentStatus = 'idle' | 'thinking' | 'error' | 'closed';
export type AgentType = 'em' | 'pm' | 'architect' | 'developer' | 'qa' | 'reviewer';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type GateStatus = 'pending' | 'approved' | 'changes_requested';
export type ArtifactType = 'spec' | 'design_doc' | 'code_change' | 'test_report' | 'markdown';

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

export interface AgentState {
  id: string;
  status: AgentStatus;
  messages: ChatMessage[];
}

export interface Project {
  _id: string;
  name: string;
  description: string;
  cwd: string;
  status: 'active' | 'archived';
  emAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  _id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedAgent: AgentType;
  agentSessionId?: string;
  context?: string;
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Gate {
  _id: string;
  projectId: string;
  taskId: string;
  title: string;
  description: string;
  status: GateStatus;
  artifactIds: string[];
  requestedBy: string;
  reviewerComment?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface Artifact {
  _id: string;
  projectId: string;
  taskId: string;
  name: string;
  type: ArtifactType;
  content: string;
  filePath?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// WebSocket message types
export interface ServerMessage {
  type: string;
  agentId?: string;
  content?: string;
  isPartial?: boolean;
  result?: string;
  error?: string;
  status?: AgentStatus;
  stats?: {
    durationMs: number;
    totalCostUsd: number;
    numTurns: number;
  };
  toolName?: string;
  toolInput?: Record<string, unknown>;
  output?: string;
  // Project-related
  projectId?: string;
  name?: string;
  emAgentId?: string;
  projects?: Array<{
    _id: string;
    name: string;
    description: string;
    status: string;
    emAgentId?: string;
  }>;
  gateId?: string;
  // DB change
  collection?: string;
  operation?: string;
  documentId?: string;
  document?: unknown;
  // Agent history (for session restoration)
  messages?: Array<{
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    isToolResult?: boolean;
    timestamp: number;
  }>;
}
