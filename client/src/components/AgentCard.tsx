import { useState, useRef, useEffect, FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentState } from '../types';

const AGENT_CONFIG: Record<string, {
  emoji: string;
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
}> = {
  em: {
    emoji: '👔',
    label: 'Engineering Manager',
    textColor: 'text-orange',
    bgColor: 'bg-orange/10',
    borderColor: 'border-orange/30',
  },
  pm: {
    emoji: '📋',
    label: 'Product Manager',
    textColor: 'text-[#A78BFA]',
    bgColor: 'bg-[#8B5CF6]/10',
    borderColor: 'border-[#8B5CF6]/30',
  },
  architect: {
    emoji: '🏗️',
    label: 'Architect',
    textColor: 'text-[#60A5FA]',
    bgColor: 'bg-[#3B82F6]/10',
    borderColor: 'border-[#3B82F6]/30',
  },
  developer: {
    emoji: '💻',
    label: 'Developer',
    textColor: 'text-[#34D399]',
    bgColor: 'bg-[#10B981]/10',
    borderColor: 'border-[#10B981]/30',
  },
  qa: {
    emoji: '🧪',
    label: 'QA Engineer',
    textColor: 'text-[#FBBF24]',
    bgColor: 'bg-[#F59E0B]/10',
    borderColor: 'border-[#F59E0B]/30',
  },
  reviewer: {
    emoji: '🔍',
    label: 'Code Reviewer',
    textColor: 'text-[#F472B6]',
    bgColor: 'bg-[#EC4899]/10',
    borderColor: 'border-[#EC4899]/30',
  },
};

interface AgentCardProps {
  agent: AgentState;
  agentType: string;
  onSendMessage: (message: string) => void;
  isPrimary?: boolean;
}

export function AgentCard({
  agent,
  agentType,
  onSendMessage,
  isPrimary = false,
}: AgentCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const config = AGENT_CONFIG[agentType] || {
    emoji: '🤖',
    label: 'Agent',
    textColor: 'text-orange',
    bgColor: 'bg-orange/10',
    borderColor: 'border-orange/30',
  };

  const isWorking = agent.status === 'thinking';

  // Auto-scroll in modal
  useEffect(() => {
    if (isModalOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agent.messages, isModalOpen]);

  // Close modal on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isModalOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isWorking) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const getStatusConfig = () => {
    switch (agent.status) {
      case 'idle': return {
        label: 'Ready',
        dotColor: 'bg-green',
        textColor: 'text-green',
        bgColor: 'bg-green/10',
        borderColor: 'border-green/25'
      };
      case 'thinking': return {
        label: 'Working',
        dotColor: 'bg-orange',
        textColor: 'text-orange',
        bgColor: 'bg-orange/10',
        borderColor: 'border-orange/25'
      };
      case 'error': return {
        label: 'Error',
        dotColor: 'bg-red',
        textColor: 'text-red',
        bgColor: 'bg-red/10',
        borderColor: 'border-red/25'
      };
      case 'closed': return {
        label: 'Done',
        dotColor: 'bg-text-muted',
        textColor: 'text-text-muted',
        bgColor: 'bg-text-muted/10',
        borderColor: 'border-text-muted/25'
      };
      default: return {
        label: 'Unknown',
        dotColor: 'bg-text-muted',
        textColor: 'text-text-muted',
        bgColor: 'bg-text-muted/10',
        borderColor: 'border-text-muted/25'
      };
    }
  };

  const statusConfig = getStatusConfig();

  // Get current activity for compact display
  const getCurrentActivity = () => {
    const recentMessages = [...agent.messages].reverse();

    // Find the most recent tool call
    const lastTool = recentMessages.find(m => m.role === 'tool' && m.toolName);
    // Find the most recent assistant message
    const lastAssistant = recentMessages.find(m => m.role === 'assistant' && m.content && !m.isPartial);

    if (isWorking && lastTool?.toolName) {
      const toolInfo = getToolDisplay(lastTool.toolName, lastTool.toolInput);
      return {
        type: 'tool' as const,
        icon: toolInfo.icon,
        label: toolInfo.label,
        desc: toolInfo.desc,
        colors: toolInfo,
      };
    }

    if (lastAssistant?.content) {
      return {
        type: 'message' as const,
        content: lastAssistant.content.slice(0, 120) + (lastAssistant.content.length > 120 ? '...' : ''),
      };
    }

    return null;
  };

  const getToolDisplay = (name: string, input?: Record<string, unknown>) => {
    const baseName = name.replace(/^mcp(__mandu)?__/, '');

    const toolMap: Record<string, {
      icon: string;
      label: string;
      textColor: string;
      bgColor: string;
      borderColor: string;
      getDesc?: (i: Record<string, unknown>) => string
    }> = {
      'create_task': {
        icon: '◆',
        label: 'DISPATCH',
        textColor: 'text-orange',
        bgColor: 'bg-orange/8',
        borderColor: 'border-orange/20',
        getDesc: (i) => i.assignedAgent ? `→ ${String(i.assignedAgent).toUpperCase()}` : ''
      },
      'complete_task': { icon: '✓', label: 'COMPLETE', textColor: 'text-green', bgColor: 'bg-green/8', borderColor: 'border-green/20' },
      'update_task': { icon: '↻', label: 'UPDATE', textColor: 'text-orange', bgColor: 'bg-orange/8', borderColor: 'border-orange/20' },
      'create_artifact': {
        icon: '❖',
        label: 'ARTIFACT',
        textColor: 'text-orange',
        bgColor: 'bg-orange/8',
        borderColor: 'border-orange/20',
        getDesc: (i) => i.name ? String(i.name) : ''
      },
      'create_gate': { icon: '⊡', label: 'GATE', textColor: 'text-golden', bgColor: 'bg-golden/8', borderColor: 'border-golden/20', getDesc: () => 'Awaiting approval' },
      'list_tasks': { icon: '≡', label: 'QUERY', textColor: 'text-orange', bgColor: 'bg-orange/8', borderColor: 'border-orange/20' },
      'Read': {
        icon: '▸',
        label: 'READ',
        textColor: 'text-[#60A5FA]',
        bgColor: 'bg-[#3B82F6]/8',
        borderColor: 'border-[#3B82F6]/20',
        getDesc: (i) => i.file_path ? String(i.file_path).split('/').pop() || '' : ''
      },
      'Write': {
        icon: '◂',
        label: 'WRITE',
        textColor: 'text-[#60A5FA]',
        bgColor: 'bg-[#3B82F6]/8',
        borderColor: 'border-[#3B82F6]/20',
        getDesc: (i) => i.file_path ? String(i.file_path).split('/').pop() || '' : ''
      },
      'Edit': {
        icon: '⟡',
        label: 'EDIT',
        textColor: 'text-[#60A5FA]',
        bgColor: 'bg-[#3B82F6]/8',
        borderColor: 'border-[#3B82F6]/20',
        getDesc: (i) => i.file_path ? String(i.file_path).split('/').pop() || '' : ''
      },
      'Bash': {
        icon: '⌘',
        label: 'EXEC',
        textColor: 'text-[#A78BFA]',
        bgColor: 'bg-[#8B5CF6]/8',
        borderColor: 'border-[#8B5CF6]/20',
        getDesc: (i) => {
          if (i.command) {
            const cmd = String(i.command).trim();
            return cmd.length > 30 ? cmd.slice(0, 30) + '...' : cmd;
          }
          return '';
        }
      },
      'Task': {
        icon: '◆',
        label: 'AGENT',
        textColor: 'text-orange',
        bgColor: 'bg-orange/8',
        borderColor: 'border-orange/20',
        getDesc: (i) => i.description ? String(i.description).slice(0, 30) : ''
      },
      'Glob': {
        icon: '⌕',
        label: 'GLOB',
        textColor: 'text-[#34D399]',
        bgColor: 'bg-[#10B981]/8',
        borderColor: 'border-[#10B981]/20',
        getDesc: (i) => i.pattern ? String(i.pattern) : ''
      },
      'Grep': {
        icon: '⌕',
        label: 'GREP',
        textColor: 'text-[#34D399]',
        bgColor: 'bg-[#10B981]/8',
        borderColor: 'border-[#10B981]/20',
        getDesc: (i) => i.pattern ? String(i.pattern).slice(0, 25) : ''
      },
      'WebSearch': {
        icon: '◉',
        label: 'SEARCH',
        textColor: 'text-[#F472B6]',
        bgColor: 'bg-[#EC4899]/8',
        borderColor: 'border-[#EC4899]/20',
        getDesc: (i) => i.query ? String(i.query).slice(0, 30) : ''
      },
      'WebFetch': {
        icon: '↓',
        label: 'FETCH',
        textColor: 'text-[#F472B6]',
        bgColor: 'bg-[#EC4899]/8',
        borderColor: 'border-[#EC4899]/20',
      },
    };

    const tool = toolMap[baseName] || toolMap[name];
    if (tool) {
      const desc = tool.getDesc && input ? tool.getDesc(input) : '';
      return { ...tool, desc };
    }

    return {
      icon: '○',
      label: baseName.replace(/_/g, ' ').toUpperCase().slice(0, 8),
      desc: '',
      textColor: 'text-text-muted',
      bgColor: 'bg-bg-hover',
      borderColor: 'border-border',
    };
  };

  const activity = getCurrentActivity();

  return (
    <>
      {/* Compact Card */}
      <button
        onClick={() => setIsModalOpen(true)}
        className={`
          w-full text-left p-4 rounded-xl border transition-all duration-200
          bg-bg-elevated hover:bg-bg-hover group
          ${isPrimary ? `${config.borderColor} shadow-[0_0_20px_rgba(255,140,66,0.08)]` : 'border-border'}
          ${isWorking ? `${config.borderColor} shadow-[0_0_25px_rgba(255,140,66,0.12)]` : ''}
        `}
      >
        <div className="flex items-start gap-3">
          {/* Agent Icon */}
          <div className={`
            w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0
            ${config.bgColor} ${config.borderColor} border
            transition-transform duration-200 group-hover:scale-105
          `}>
            {config.emoji}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header Row */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className={`text-sm font-bold ${config.textColor}`}>
                {config.label}
              </span>

              {/* Status Badge */}
              <div className={`
                flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide
                ${statusConfig.bgColor} ${statusConfig.borderColor} ${statusConfig.textColor}
                border
              `}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor} ${isWorking ? 'animate-pulse' : ''}`} />
                {statusConfig.label}
              </div>
            </div>

            {/* Activity/Status Row */}
            {activity?.type === 'tool' ? (
              <div className={`
                inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-mono
                ${activity.colors.bgColor} ${activity.colors.borderColor} ${activity.colors.textColor}
                border
              `}>
                <span className={`w-1.5 h-1.5 rounded-full bg-current ${isWorking ? 'animate-pulse' : ''}`} />
                <span className="font-bold">{activity.icon}</span>
                <span className="font-bold">{activity.label}</span>
                {activity.desc && (
                  <>
                    <span className="opacity-40">→</span>
                    <span className="opacity-70 truncate max-w-[180px]">{activity.desc}</span>
                  </>
                )}
              </div>
            ) : activity?.type === 'message' ? (
              <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                {activity.content}
              </p>
            ) : (
              <p className="text-xs text-text-muted italic">Waiting for instructions...</p>
            )}
          </div>

          {/* Expand indicator */}
          <div className="text-text-muted group-hover:text-orange transition-colors self-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </div>
        </div>
      </button>

      {/* Fullscreen Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-modal-fade"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl h-[85vh] bg-bg-elevated border border-border rounded-2xl flex flex-col overflow-hidden shadow-modal animate-modal-slide"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <header className={`
              flex items-center justify-between px-5 py-4 border-b border-border
              bg-gradient-to-r from-transparent ${config.bgColor.replace('bg-', 'to-')}/30
            `}>
              <div className="flex items-center gap-3">
                <div className={`
                  w-12 h-12 rounded-xl flex items-center justify-center text-2xl
                  ${config.bgColor} ${config.borderColor} border
                `}>
                  {config.emoji}
                </div>
                <div>
                  <h2 className={`text-lg font-bold ${config.textColor}`}>{config.label}</h2>
                  <div className={`
                    inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide mt-1
                    ${statusConfig.bgColor} ${statusConfig.borderColor} ${statusConfig.textColor}
                    border
                  `}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor} ${isWorking ? 'animate-pulse' : ''}`} />
                    {statusConfig.label}
                  </div>
                </div>
              </div>

              <button
                className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-all"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5">
              {agent.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className={`
                    w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-4
                    ${config.bgColor} ${config.borderColor} border
                  `}>
                    {config.emoji}
                  </div>
                  <p className="text-text-muted">Waiting for instructions...</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {agent.messages.map((message) => {
                    if (message.role === 'tool' && message.toolName) {
                      const toolDisplay = getToolDisplay(message.toolName, message.toolInput);
                      return (
                        <div
                          key={message.id}
                          className={`
                            flex items-center gap-2.5 px-3 py-2 rounded-lg border
                            text-xs font-mono
                            ${toolDisplay.bgColor} ${toolDisplay.borderColor} ${toolDisplay.textColor}
                          `}
                        >
                          <span className="font-bold opacity-70">{toolDisplay.icon}</span>
                          <span className="font-bold">{toolDisplay.label}</span>
                          {toolDisplay.desc && (
                            <>
                              <span className="opacity-40">→</span>
                              <span className="opacity-70 truncate">{toolDisplay.desc}</span>
                            </>
                          )}
                        </div>
                      );
                    }

                    if (message.role === 'tool' && message.isToolResult) {
                      return null;
                    }

                    return (
                      <div
                        key={message.id}
                        className={`
                          rounded-xl px-4 py-3
                          ${message.role === 'assistant'
                            ? 'bg-bg-primary border-l-2 border-l-orange/40'
                            : `${config.bgColor} border ${config.borderColor} ml-8`
                          }
                          ${message.isPartial ? 'opacity-60' : ''}
                        `}
                      >
                        {message.role === 'assistant' ? (
                          <div className="chat-markdown text-text-primary text-sm leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm text-text-primary">{message.content}</p>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input (only for primary agent) */}
            {isPrimary && (
              <form
                className="flex items-center gap-3 p-4 border-t border-border bg-bg-secondary/50"
                onSubmit={handleSubmit}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isWorking ? 'Agent is working...' : 'Send a message...'}
                  disabled={isWorking}
                  autoFocus
                  className="
                    flex-1 bg-bg-primary border border-border rounded-xl px-4 py-3
                    text-sm text-text-primary placeholder:text-text-muted
                    focus:outline-none focus:border-orange/60 focus:ring-2 focus:ring-orange/15
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-all
                  "
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isWorking}
                  className="
                    w-11 h-11 flex items-center justify-center
                    bg-orange hover:bg-orange-dark active:scale-95
                    text-white rounded-xl font-bold text-lg
                    transition-all duration-150
                    disabled:opacity-40 disabled:cursor-not-allowed
                  "
                >
                  →
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
