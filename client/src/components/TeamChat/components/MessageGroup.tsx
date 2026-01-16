import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AGENT_CONFIG } from '../constants';
import type { ChatMessage, AgentWithType } from '../types';
import { ToolCard } from './ToolCard';

interface MessageGroupProps {
  agentType: string;
  messages: ChatMessage[];
  expandedTools: Set<string>;
  onToggleToolExpand: (id: string) => void;
  onSelectAgent: (type: string) => void;
  agentsByType: Map<string, AgentWithType>;
  animatedMessages: Set<string>;
  onMessageAnimated: (id: string) => void;
}

export function MessageGroup({
  agentType,
  messages,
  expandedTools,
  onToggleToolExpand,
  onSelectAgent,
  agentsByType,
  animatedMessages,
  onMessageAnimated,
}: MessageGroupProps) {
  const config = AGENT_CONFIG[agentType] || AGENT_CONFIG.em;
  const isUser = messages[0].role === 'user';

  return (
    <div className={`flex gap-3 w-full ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <button
        onClick={() => onSelectAgent(agentType)}
        className={`
          w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0
          ${config.bgColor} ${config.borderColor} border
          hover:scale-110 transition-transform
        `}
      >
        {config.emoji}
      </button>

      {/* Messages */}
      <div className={`flex flex-col gap-1.5 max-w-[75%] min-w-0 ${isUser ? 'items-end' : ''}`}>
        {/* Agent Name */}
        <span className={`text-xs font-bold ${config.textColor} px-1`}>
          {config.label}
        </span>

        {messages.map((msg) => {
          // Tool call - expandable card
          if (msg.role === 'tool' && msg.toolName) {
            return (
              <ToolCard
                key={msg.id}
                message={msg}
                isExpanded={expandedTools.has(msg.id)}
                onToggleExpand={() => onToggleToolExpand(msg.id)}
                agentsByType={agentsByType}
                agentType={agentType}
              />
            );
          }

          // Skip tool results shown inline
          if (msg.role === 'tool') return null;

          // Message bubble - only animate on first appearance
          const shouldAnimate = !animatedMessages.has(msg.id);
          if (shouldAnimate) {
            onMessageAnimated(msg.id);
          }

          return (
            <div
              key={msg.id}
              className={`
                rounded-2xl px-4 py-3 max-w-full overflow-hidden
                ${shouldAnimate ? 'animate-fade-in-up' : ''}
                ${isUser
                  ? 'bg-gradient-to-br from-orange/20 to-orange/10 border border-orange/30 rounded-tr-sm shadow-sm'
                  : 'assistant-message-card rounded-tl-sm'
                }
              `}
            >
              <div className="chat-markdown text-sm text-text-primary leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
