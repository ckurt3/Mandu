import type { AgentState, Gate, Artifact, MessagePayload } from '@shared/types';

export interface AttachedFile {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'text';
  dataUrl?: string;
  content?: string;
}

export interface AgentWithType {
  agent: AgentState;
  type: string;
}

export interface ChatMessage {
  id: string;
  agentType: string;
  role: 'assistant' | 'user' | 'tool' | 'system';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  isPartial?: boolean;
  isToolResult?: boolean;
  timestamp: number;
}

export interface TeamChatProps {
  agents: AgentWithType[];
  onSendMessage: (payload: MessagePayload) => void;
  projectName: string;
  projectId: string;
  gates: Gate[];
  artifacts: Artifact[];
  onResolveGate: (gateId: string, status: 'approved' | 'rejected', comment?: string) => void;
  onLoadEarlierMessages?: (messages: ChatMessage[]) => void;
  isConnected?: boolean;
}

export interface SlashCommand {
  name: string;
  description: string;
  source: string;
}

export interface ToolDisplay {
  icon: string;
  label: string;
  desc: string;
  textColor: string;
  bgColor: string;
  baseName: string;
}
