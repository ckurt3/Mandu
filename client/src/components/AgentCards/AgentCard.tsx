import { AGENT_CONFIG } from '../TeamChat/constants';
import type { AgentCardProps } from './types';

/**
 * Status indicator colors and labels
 */
const STATUS_CONFIG = {
  idle: {
    color: 'bg-text-muted',
    borderColor: 'border-text-muted/30',
    label: 'Idle',
    pulse: false,
  },
  working: {
    color: 'bg-[#3B82F6]',
    borderColor: 'border-[#3B82F6]/30',
    label: 'Working',
    pulse: true,
  },
  paused: {
    color: 'bg-[#FBBF24]',
    borderColor: 'border-[#FBBF24]/30',
    label: 'Paused',
    pulse: false,
  },
  error: {
    color: 'bg-red',
    borderColor: 'border-red/30',
    label: 'Error',
    pulse: false,
  },
};

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const config = AGENT_CONFIG[agent.agentType] || AGENT_CONFIG.em;
  const statusConfig = STATUS_CONFIG[agent.status];

  // Calculate TODO progress
  const totalTodos = agent.todos.length;
  const completedTodos = agent.todos.filter(t => t.status === 'completed').length;
  const hasActiveTodo = agent.todos.some(t => t.status === 'in_progress');
  const currentTodo = agent.todos.find(t => t.status === 'in_progress');
  const progressPercent = totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0;

  // Get last message preview (truncated)
  const lastMessagePreview = agent.lastMessage
    ? agent.lastMessage.length > 80
      ? agent.lastMessage.slice(0, 80) + '...'
      : agent.lastMessage
    : null;

  // Format time ago
  const formatTimeAgo = (timestamp?: number): string => {
    if (!timestamp) return '';
    const diffMs = Date.now() - timestamp;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-4 rounded-xl border transition-all duration-200
        bg-bg-elevated hover:bg-bg-hover group
        ${agent.status === 'working' ? 'border-[#3B82F6]/40' : 'border-border'}
        ${agent.status === 'paused' ? 'border-[#FBBF24]/40' : ''}
        ${agent.status === 'error' ? 'border-red/40' : ''}
        hover:border-orange/40 hover:shadow-[0_0_20px_rgba(255,140,66,0.1)]
        animate-fade-in-up
      `}
    >
      {/* Header Row: Avatar + Name + Status */}
      <div className="flex items-center gap-3 mb-3">
        {/* Agent Avatar */}
        <div className={`
          w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0
          ${config.bgColor} ${config.borderColor} border
          transition-transform group-hover:scale-105
        `}>
          {config.emoji}
        </div>

        {/* Name and Role */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-sm ${config.textColor} truncate`}>
              {agent.displayName}
            </span>
            {agent.isPrimary && (
              <span className="px-1.5 py-0.5 rounded bg-orange/15 text-[9px] font-bold text-orange uppercase tracking-wide flex-shrink-0">
                Primary
              </span>
            )}
          </div>
          <span className="text-xs text-text-muted">{config.label}</span>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className={`
            w-2 h-2 rounded-full ${statusConfig.color}
            ${statusConfig.pulse ? 'animate-pulse' : ''}
          `} />
          <span className="text-[10px] font-medium text-text-muted">
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* TODO Progress Bar (only show if there are todos) */}
      {totalTodos > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
              Progress
            </span>
            <span className="text-[10px] font-mono text-text-secondary">
              {completedTodos}/{totalTodos}
            </span>
          </div>
          <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                progressPercent === 100
                  ? 'bg-green'
                  : hasActiveTodo
                    ? 'bg-[#3B82F6]'
                    : 'bg-orange'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Current Task (if working on something) */}
      {currentTodo && (
        <div className="mb-3 px-2.5 py-2 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/20">
          <div className="flex items-center gap-1.5">
            <span className="text-[#3B82F6] text-xs animate-pulse">●</span>
            <span className="text-xs text-text-primary truncate">
              {currentTodo.activeForm}
            </span>
          </div>
        </div>
      )}

      {/* Last Message Preview */}
      {lastMessagePreview && (
        <div className="text-xs text-text-secondary leading-relaxed line-clamp-2 mb-2">
          {lastMessagePreview}
        </div>
      )}

      {/* Footer: Time + Queued Messages Badge */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-text-muted">
          {formatTimeAgo(agent.lastMessageTime)}
        </span>

        {agent.queuedMessages.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-[#FBBF24]/15 text-[10px] font-semibold text-[#FBBF24]">
            {agent.queuedMessages.length} queued
          </span>
        )}
      </div>
    </button>
  );
}
