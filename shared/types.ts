// Shared types between client and server

// Domain types
export type AgentStatus = 'idle' | 'thinking' | 'error' | 'closed';
export type AgentType = 'em' | 'pm' | 'architect' | 'developer' | 'qa' | 'reviewer';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export type GateStatus = 'pending' | 'approved' | 'rejected';
export type ProjectStatus = 'idle' | 'running' | 'waiting_approval' | 'completed' | 'failed';
export type ArtifactType = 'spec' | 'design_doc' | 'code_change' | 'test_report' | 'review' | 'markdown';

// Diff types for code review
export type DiffViewMode = 'line-by-line' | 'side-by-side';

export interface DiffFile {
  id: string;
  filename: string;
  oldPath: string | null;
  newPath: string | null;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
}

export interface Diff {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  rawDiff: string; // The raw unified diff content
  files: DiffFile[];
  baseRef: string | null; // e.g., 'main', commit sha
  headRef: string | null; // e.g., 'feature-branch', commit sha
  createdAt: Date | null;
}

// Workspace types
export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// Frontend data models (using string IDs for JSON serialization)
export interface Project {
  id: string;
  name: string;
  description: string | null;
  cwd: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  status: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastActivityAt: Date | null;
}

export interface Task {
  id: string;
  projectId: string;
  agentType: string;
  title: string;
  input: string | null;
  output: string | null;
  status: string | null;
  error: string | null;
  attempts: number | null;
  createdAt: Date | null;
  completedAt: Date | null;
}

export interface Gate {
  id: string;
  projectId: string;
  type: string;
  title: string;
  description: string | null;
  status: string | null;
  requestedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolution: string | null;
}

export interface Artifact {
  id: string;
  projectId: string;
  taskId: string | null;
  type: string;
  title: string;
  content: string | null;
  filePath: string | null;
  metadata: string | null;
  createdAt: Date | null;
}

// Chat/Agent state (for UI)
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  isPartial?: boolean;
  timestamp: number;
  agentType?: string;
  taskId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  isToolResult?: boolean;
}

export interface AgentState {
  id: string;
  status: AgentStatus;
  messages: ChatMessage[];
}

// WebSocket message types

// Client -> Server messages
export interface SubscribeProjectMessage {
  type: 'subscribe_project';
  projectId: string;
}

export interface UnsubscribeProjectMessage {
  type: 'unsubscribe_project';
}

export interface CreateProjectMessage {
  type: 'create_project';
  name: string;
  description: string;
  cwd: string;
}

export interface ListProjectsMessage {
  type: 'list_projects';
}

export interface MessagePayload {
  text: string;
  images?: string[];
  pdfs?: Array<{ name: string; dataUrl: string }>;
  textFiles?: Array<{ name: string; content: string }>;
}

export interface SendProjectMessageMessage {
  type: 'send_project_message';
  projectId: string;
  message: string | MessagePayload;
}

export interface ResolveGateMessage {
  type: 'resolve_gate';
  gateId: string;
  status: 'approved' | 'rejected';
  comment?: string;
}

// Workspace messages
export interface ListWorkspacesMessage {
  type: 'list_workspaces';
}

export interface CreateWorkspaceMessage {
  type: 'create_workspace';
  name: string;
  path: string;
}

export interface DeleteWorkspaceMessage {
  type: 'delete_workspace';
  workspaceId: string;
}

// Agent control messages
export interface PauseAgentMessage {
  type: 'pause_agent';
  projectId: string;
  taskId: string; // The specific agent/task to pause
}

export interface ResumeAgentMessage {
  type: 'resume_agent';
  projectId: string;
  taskId: string; // The specific agent/task to resume
  message?: string; // Optional message to send on resume
}

export interface SendAgentMessageMessage {
  type: 'send_agent_message';
  projectId: string;
  taskId: string; // The specific agent/task to send to
  message: string;
}

export type ClientMessage =
  | SubscribeProjectMessage
  | UnsubscribeProjectMessage
  | CreateProjectMessage
  | ListProjectsMessage
  | SendProjectMessageMessage
  | ResolveGateMessage
  | ListWorkspacesMessage
  | CreateWorkspaceMessage
  | DeleteWorkspaceMessage
  | PauseAgentMessage
  | ResumeAgentMessage
  | SendAgentMessageMessage;

// Server -> Client messages
export interface ProjectSubscribedMessage {
  type: 'project_subscribed';
  projectId: string;
  project: Project;
  tasks?: Task[];
  pendingGates: Gate[];
  artifacts?: Artifact[];
  timeline?: ServerMessage[];
}

export interface ProjectCreatedMessage {
  type: 'project_created';
  projectId: string;
  name: string;
  description?: string;
  workspaceId?: string;
  workspaceName?: string | null;
}

export interface ProjectsListMessage {
  type: 'projects_list';
  projects: Array<{
    _id: string;
    name: string;
    description: string | null;
    status: string | null;
    workspaceId?: string | null;
    workspaceName?: string | null;
    lastActivityAt?: Date | null;
  }>;
}

export interface ProjectErrorMessage {
  type: 'project_error';
  error: string;
}

export interface ProjectStatusMessage {
  type: 'project_status';
  projectId: string;
  status: string;
  summary?: string;
  error?: string;
}

export interface TaskStartedMessage {
  type: 'task_started';
  projectId: string;
  taskId: string;
  agentType: string;
}

export interface TaskCompletedMessage {
  type: 'task_completed';
  projectId: string;
  taskId: string;
  agentType: string;
  result: unknown;
}

export interface TaskFailedMessage {
  type: 'task_failed';
  projectId: string;
  taskId: string;
  agentType: string;
  error: string;
}

export interface AgentMessageMessage {
  type: 'agent_message';
  taskId?: string;
  projectId: string;
  agentType: string;
  message?: string;
  isPartial?: boolean;
  isUserMessage?: boolean;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  toolUseId?: string;
}

export interface GateCreatedMessage {
  type: 'gate_created';
  projectId: string;
  gate: { id: string; type: string; title: string; description?: string };
}

export interface GateResolvedMessage {
  type: 'gate_resolved';
  gateId: string;
  status: string;
  projectId?: string;
}

export interface ArtifactCreatedMessage {
  type: 'artifact_created';
  projectId: string;
  artifact: { id: string; type: string; title: string };
}

export interface EMWaitingMessage {
  type: 'em_waiting';
  projectId: string;
}

// Workspace server messages
export interface WorkspacesListMessage {
  type: 'workspaces_list';
  workspaces: Workspace[];
}

export interface WorkspaceCreatedMessage {
  type: 'workspace_created';
  workspace: Workspace;
}

export interface WorkspaceDeletedMessage {
  type: 'workspace_deleted';
  workspaceId: string;
}

export interface WorkspaceErrorMessage {
  type: 'workspace_error';
  error: string;
}

// Agent status messages (server -> client)
export interface AgentPausedMessage {
  type: 'agent_paused';
  projectId: string;
  taskId: string;
}

export interface AgentResumedMessage {
  type: 'agent_resumed';
  projectId: string;
  taskId: string;
}

// TODO state from TodoWrite tool
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export interface AgentTodoUpdateMessage {
  type: 'agent_todo_update';
  projectId: string;
  taskId: string;
  agentType: string;
  todos: TodoItem[];
}

export type ServerMessage =
  | ProjectSubscribedMessage
  | ProjectCreatedMessage
  | ProjectsListMessage
  | ProjectErrorMessage
  | ProjectStatusMessage
  | TaskStartedMessage
  | TaskCompletedMessage
  | TaskFailedMessage
  | AgentMessageMessage
  | GateCreatedMessage
  | GateResolvedMessage
  | ArtifactCreatedMessage
  | EMWaitingMessage
  | WorkspacesListMessage
  | WorkspaceCreatedMessage
  | WorkspaceDeletedMessage
  | WorkspaceErrorMessage
  | AgentPausedMessage
  | AgentResumedMessage
  | AgentTodoUpdateMessage;
