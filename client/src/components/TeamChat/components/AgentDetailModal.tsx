import { AGENT_CONFIG, AgentConfigItem } from '../constants';
import type { AgentWithType } from '../types';

interface AgentDetailModalProps {
  agentType: string;
  config: AgentConfigItem;
  agent: AgentWithType | null;
  onClose: () => void;
}

export function AgentDetailModal({
  agentType,
  config,
  agent,
  onClose,
}: AgentDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-modal-fade"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-bg-elevated border border-border rounded-2xl overflow-hidden shadow-modal animate-modal-slide"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`
          flex items-center justify-between p-5 border-b border-border
          bg-gradient-to-r from-transparent ${config.bgColor.replace('bg-', 'to-')}/50
        `}>
          <div className="flex items-center gap-3">
            <div className={`
              w-12 h-12 rounded-xl flex items-center justify-center text-2xl
              ${config.bgColor} ${config.borderColor} border
            `}>
              {config.emoji}
            </div>
            <div>
              <h2 className={`text-lg font-bold ${config.textColor}`}>
                {config.label}
              </h2>
              <div className={`
                inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide mt-1
                ${agent
                  ? agent.agent.status === 'thinking'
                    ? 'bg-orange/15 text-orange border border-orange/25'
                    : agent.agent.status === 'idle'
                    ? 'bg-green/15 text-green border border-green/25'
                    : 'bg-text-muted/15 text-text-muted border border-text-muted/25'
                  : 'bg-text-muted/10 text-text-muted border border-text-muted/20'
                }
              `}>
                <span className={`
                  w-1.5 h-1.5 rounded-full
                  ${agent
                    ? agent.agent.status === 'thinking'
                      ? 'bg-orange animate-pulse'
                      : agent.agent.status === 'idle'
                      ? 'bg-green'
                      : 'bg-text-muted'
                    : 'bg-text-muted/50'
                  }
                `} />
                {agent
                  ? agent.agent.status === 'thinking' ? 'Working' : 'Ready'
                  : 'Idle'
                }
              </div>
            </div>
          </div>
          <button
            className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-all"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Description */}
          <div>
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">Role</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              {config.description}
            </p>
          </div>

          {/* Stats */}
          {agent && (
            <div>
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">Session</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-primary rounded-lg p-3 border border-border">
                  <div className="text-2xl font-bold text-text-primary">
                    {agent.agent.messages.filter(m => m.role === 'assistant').length}
                  </div>
                  <div className="text-xs text-text-muted">Messages</div>
                </div>
                <div className="bg-bg-primary rounded-lg p-3 border border-border">
                  <div className="text-2xl font-bold text-text-primary">
                    {agent.agent.messages.filter(m => m.role === 'tool' && m.toolName).length}
                  </div>
                  <div className="text-xs text-text-muted">Tool Calls</div>
                </div>
              </div>
            </div>
          )}

          {!agent && (
            <div className="bg-bg-primary rounded-lg p-4 border border-border text-center">
              <p className="text-sm text-text-muted">
                This agent hasn't been spawned yet. The EM will activate them when needed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
