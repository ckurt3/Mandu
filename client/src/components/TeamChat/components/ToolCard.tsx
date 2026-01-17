import type { ChatMessage, AgentWithType } from '../types';
import { formatToolInput, getToolDisplay } from '../utils';

interface ToolCardProps {
  message: ChatMessage;
  isExpanded: boolean;
  onToggleExpand: () => void;
  agentsByType: Map<string, AgentWithType>;
  agentType: string;
}

export function ToolCard({
  message,
  isExpanded,
  onToggleExpand,
  agentsByType,
  agentType,
}: ToolCardProps) {
  const tool = getToolDisplay(message.toolName!, message.toolInput);

  // Check if this tool is still running
  const agentData = agentsByType.get(agentType);
  const agentMessages = agentData?.agent.messages || [];
  const thisIndex = agentMessages.findIndex(m => `${agentData?.agent.id}-${m.id}` === message.id);
  const hasMessagesAfter = thisIndex >= 0 && thisIndex < agentMessages.length - 1;
  const isToolRunning = !hasMessagesAfter && !message.isToolResult;

  // Status-based border color
  const statusBorderColor = isToolRunning ? 'border-l-orange' : 'border-l-green';

  return (
    <div className="animate-fade-in-up w-full">
      <button
        onClick={onToggleExpand}
        className="w-full text-left"
      >
        <div
          className={`
            rounded-lg transition-all duration-200
            bg-bg-secondary hover:bg-bg-elevated/50
            border-l-2 ${statusBorderColor}
          `}
        >
          {/* Header row */}
          <div className="flex items-start gap-3 py-2.5 px-3">
            {/* Status Icon */}
            <div
              className={`
                w-7 h-7 rounded flex items-center justify-center shrink-0 font-mono text-xs font-medium
                ${isToolRunning ? 'bg-orange/10' : 'bg-green/10'}
              `}
            >
              {isToolRunning ? (
                <span className="animate-pulse text-base text-orange">●</span>
              ) : (
                <span className="text-green text-sm">✓</span>
              )}
            </div>

            {/* Tool Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="opacity-60 text-sm">{tool.icon}</span>
                <span className={`font-mono text-xs font-semibold ${isToolRunning ? 'text-orange' : 'text-green'}`}>
                  {tool.label}
                </span>
                {isToolRunning && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange/15 text-orange font-semibold">
                    executing
                  </span>
                )}
              </div>
              <div className="font-mono text-xs text-text-muted truncate">
                {formatToolInput(message.toolInput)}
              </div>
            </div>

            {/* Expand Arrow */}
            <span
              className={`text-xs text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            >
              ▼
            </span>
          </div>

          {/* Expanded Details - inside same card */}
          {isExpanded && (
            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50 mx-3">
              {/* Input Section */}
              {message.toolInput && Object.keys(message.toolInput).length > 0 && (
                <div>
                  <div className="text-[10px] font-mono font-medium uppercase tracking-wider text-text-muted mb-1">
                    Input
                  </div>
                  <pre className="font-mono text-xs overflow-x-auto text-text-secondary">
                    {JSON.stringify(message.toolInput, null, 2)}
                  </pre>
                </div>
              )}

              {/* Output Section */}
              {message.toolResult && (
                <div>
                  <div className="text-[10px] font-mono font-medium uppercase tracking-wider text-text-muted mb-1 mt-2">
                    Output
                  </div>
                  <pre className="font-mono text-xs overflow-x-auto text-text-secondary max-h-64 overflow-y-auto">
                    {message.toolResult.length > 2000 ? message.toolResult.slice(0, 2000) + '\n...(truncated)' : message.toolResult}
                  </pre>
                </div>
              )}

              {!message.toolInput && !message.toolResult && (
                <p className="text-text-muted italic text-xs">No additional details</p>
              )}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
