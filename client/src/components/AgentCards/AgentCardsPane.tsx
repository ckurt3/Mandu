import { useMemo, useCallback } from 'react';
import { AGENT_CONFIG } from '../TeamChat/constants';
import { AgentCardGrid } from './AgentCardGrid';
import { AgentDetailView } from './AgentDetailView';
import { useAgentNavigation } from './AgentNavigationContext';
import type { AgentCardData, ExtendedAgentStatus } from './types';
import type { AgentState, Gate, Artifact, Task, MessagePayload, TodoItem } from '@shared/types';
import type { ExtendedAgentState } from '../../hooks/useWebSocket';

interface AgentCardsPaneProps {
  projectId: string;
  projectName: string;
  agents: ExtendedAgentState[];
  tasks: Task[];
  gates: Gate[];
  artifacts: Artifact[];
  isConnected: boolean;
  onSendMessage: (message: string | MessagePayload) => void;
  onPauseAgent: (projectId: string, taskId: string) => void;
  onResumeAgent: (projectId: string, taskId: string, message?: string) => void;
  onSendAgentMessage: (projectId: string, taskId: string, message: string) => void;
  onResolveGate: (gateId: string, status: 'approved' | 'rejected', comment?: string) => void;
  getAgent: (id: string) => ExtendedAgentState | undefined;
}

/**
 * Convert AgentState status to our ExtendedAgentStatus
 */
function getExtendedStatus(agent: ExtendedAgentState): ExtendedAgentStatus {
  if (agent.isPaused) return 'paused';
  if (agent.status === 'thinking') return 'working';
  if (agent.status === 'error') return 'error';
  return 'idle';
}

/**
 * Get display name for an agent
 */
function getDisplayName(agentType: string, isPrimary: boolean): string {
  const config = AGENT_CONFIG[agentType];
  if (!config) return agentType;
  if (isPrimary) return 'Project Manager';
  return config.label;
}

/**
 * Extract last message content from agent
 */
function getLastMessage(agent: AgentState): { content: string; timestamp: number } | null {
  const messages = agent.messages.filter(m => m.role === 'assistant' && m.content);
  if (messages.length === 0) return null;
  const last = messages[messages.length - 1];
  return { content: last.content, timestamp: last.timestamp };
}

export function AgentCardsPane({
  projectId,
  projectName,
  agents,
  tasks,
  gates,
  artifacts,
  isConnected,
  onSendMessage,
  onPauseAgent,
  onResumeAgent,
  onSendAgentMessage,
  onResolveGate,
  getAgent,
}: AgentCardsPaneProps) {
  const { state, selectAgent, goBack } = useAgentNavigation();

  // Build agent card data from state
  const agentCards: AgentCardData[] = useMemo(() => {
    const result: AgentCardData[] = [];
    const processedIds = new Set<string>();

    // Add EM agent first (primary)
    const emAgentId = `em-${projectId}`;
    const emAgent = agents.find(a => a.id === emAgentId);

    if (emAgent) {
      const lastMsg = getLastMessage(emAgent);
      result.push({
        id: emAgent.id,
        agentType: 'em',
        displayName: getDisplayName('em', true),
        status: getExtendedStatus(emAgent),
        todos: emAgent.todos || [],
        lastMessage: lastMsg?.content,
        lastMessageTime: lastMsg?.timestamp,
        isPrimary: true,
        messages: emAgent.messages,
        queuedMessages: emAgent.queuedMessages || [],
      });
      processedIds.add(emAgent.id);
    } else {
      // Create placeholder for EM
      result.push({
        id: emAgentId,
        agentType: 'em',
        displayName: getDisplayName('em', true),
        status: 'idle',
        todos: [],
        isPrimary: true,
        messages: [],
        queuedMessages: [],
      });
    }

    // Add worker agents from tasks
    for (const task of tasks) {
      if (task.status !== 'running' && task.status !== 'pending') continue;

      const agentId = `${task.agentType}-${task.id}`;
      if (processedIds.has(agentId)) continue;

      const workerAgent = agents.find(a => a.id === agentId);
      if (workerAgent) {
        const lastMsg = getLastMessage(workerAgent);
        result.push({
          id: workerAgent.id,
          agentType: task.agentType,
          displayName: getDisplayName(task.agentType, false),
          status: getExtendedStatus(workerAgent),
          todos: workerAgent.todos || [],
          lastMessage: lastMsg?.content,
          lastMessageTime: lastMsg?.timestamp,
          isPrimary: false,
          taskId: task.id,
          messages: workerAgent.messages,
          queuedMessages: workerAgent.queuedMessages || [],
        });
        processedIds.add(workerAgent.id);
      }
    }

    // Also check for any agents in the agents array that we haven't processed
    for (const agent of agents) {
      if (processedIds.has(agent.id)) continue;

      // Parse agent ID to get type
      const match = agent.id.match(/^([^-]+)-(.+)$/);
      if (!match) continue;

      const [, agentType, taskIdOrProject] = match;

      // Skip EM agents from other projects
      if (agentType === 'em' && taskIdOrProject !== projectId) continue;

      // For worker agents, check if task belongs to this project
      const task = tasks.find(t => t.id === taskIdOrProject);
      if (agentType !== 'em' && (!task || task.projectId !== projectId)) continue;

      const lastMsg = getLastMessage(agent);
      result.push({
        id: agent.id,
        agentType,
        displayName: getDisplayName(agentType, agentType === 'em'),
        status: getExtendedStatus(agent),
        todos: agent.todos || [],
        lastMessage: lastMsg?.content,
        lastMessageTime: lastMsg?.timestamp,
        isPrimary: agentType === 'em',
        taskId: agentType !== 'em' ? taskIdOrProject : undefined,
        messages: agent.messages,
        queuedMessages: agent.queuedMessages || [],
      });
      processedIds.add(agent.id);
    }

    return result;
  }, [agents, tasks, projectId]);

  // Get selected agent data
  const selectedAgent = useMemo(() => {
    if (!state.selectedAgentId) return null;
    return agentCards.find(a => a.id === state.selectedAgentId) || null;
  }, [state.selectedAgentId, agentCards]);

  // Handle sending message to the selected agent
  const handleSendMessage = useCallback((message: string | MessagePayload) => {
    if (!selectedAgent) return;

    const text = typeof message === 'string' ? message : message.text;
    if (!text.trim()) return;

    if (selectedAgent.isPrimary) {
      // EM messages go through the project message system
      onSendMessage(message);
    } else if (selectedAgent.taskId) {
      // Worker messages go through the agent message system
      onSendAgentMessage(projectId, selectedAgent.taskId, text);
    }
  }, [selectedAgent, projectId, onSendMessage, onSendAgentMessage]);

  // Handle pause
  const handlePause = useCallback(() => {
    if (!selectedAgent) return;
    const taskId = selectedAgent.isPrimary ? projectId : selectedAgent.taskId;
    if (taskId) {
      onPauseAgent(projectId, taskId);
    }
  }, [selectedAgent, projectId, onPauseAgent]);

  // Handle resume
  const handleResume = useCallback((message?: string) => {
    if (!selectedAgent) return;
    const taskId = selectedAgent.isPrimary ? projectId : selectedAgent.taskId;
    if (taskId) {
      onResumeAgent(projectId, taskId, message);
    }
  }, [selectedAgent, projectId, onResumeAgent]);

  return (
    <div className="flex flex-col h-full">
      {state.view === 'grid' ? (
        <>
          {/* Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-bg-secondary/50">
            <div className="flex items-center gap-2">
              <span className="text-lg">👥</span>
              <div>
                <h2 className="text-sm font-bold text-text-primary">Team</h2>
                <p className="text-xs text-text-muted truncate">{projectName}</p>
              </div>
            </div>
          </div>

          {/* Agent Grid */}
          <AgentCardGrid
            agents={agentCards}
            onSelectAgent={selectAgent}
          />
        </>
      ) : selectedAgent ? (
        <AgentDetailView
          agent={selectedAgent}
          onBack={goBack}
          onSendMessage={handleSendMessage}
          onPause={handlePause}
          onResume={handleResume}
          isConnected={isConnected}
          gates={gates}
          artifacts={artifacts}
          onResolveGate={onResolveGate}
        />
      ) : (
        // Fallback if agent not found
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <p className="text-sm text-text-muted">Agent not found</p>
          <button
            onClick={goBack}
            className="mt-4 px-4 py-2 rounded-lg bg-orange/15 text-orange text-sm font-semibold hover:bg-orange/25 transition-all"
          >
            Back to Team
          </button>
        </div>
      )}
    </div>
  );
}
