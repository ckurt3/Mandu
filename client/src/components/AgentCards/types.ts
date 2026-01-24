import type { AgentState, TodoItem, Artifact, Gate, MessagePayload } from '@shared/types';

// Extended agent status to include paused state
export type ExtendedAgentStatus = 'idle' | 'working' | 'paused' | 'error';

// Agent with extended info for the card system
export interface AgentCardData {
  id: string;
  agentType: string;
  displayName: string;
  status: ExtendedAgentStatus;
  todos: TodoItem[];
  lastMessage?: string;
  lastMessageTime?: number;
  isPrimary?: boolean; // true for EM
  taskId?: string; // for worker agents
  messages: AgentState['messages'];
  queuedMessages: string[]; // messages queued while paused
}

// Navigation state
export interface AgentNavigationState {
  view: 'grid' | 'detail';
  selectedAgentId: string | null;
}

// Context type
export interface AgentNavigationContextType {
  state: AgentNavigationState;
  selectAgent: (agentId: string) => void;
  goBack: () => void;
}

// Props for individual components
export interface AgentCardProps {
  agent: AgentCardData;
  onClick: () => void;
}

export interface AgentCardGridProps {
  agents: AgentCardData[];
  onSelectAgent: (agentId: string) => void;
}

export interface AgentDetailViewProps {
  agent: AgentCardData;
  onBack: () => void;
  onSendMessage: (message: string | MessagePayload) => void;
  onPause: () => void;
  onResume: (message?: string) => void;
  isConnected?: boolean;
  gates?: Gate[];
  artifacts?: Artifact[];
  onResolveGate?: (gateId: string, status: 'approved' | 'rejected', comment?: string) => void;
}
