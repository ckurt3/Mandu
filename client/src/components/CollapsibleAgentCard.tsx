import { useState, useRef, useEffect, FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentState } from '../types';

const AGENT_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  em: { emoji: '👔', label: 'Engineering Manager', color: 'var(--orange)' },
  pm: { emoji: '📋', label: 'Product Manager', color: '#8B5CF6' },
  architect: { emoji: '🏗️', label: 'Architect', color: '#3B82F6' },
  developer: { emoji: '💻', label: 'Developer', color: '#10B981' },
  qa: { emoji: '🧪', label: 'QA Engineer', color: '#F59E0B' },
  reviewer: { emoji: '🔍', label: 'Code Reviewer', color: '#EC4899' },
};

interface CollapsibleAgentCardProps {
  agent: AgentState;
  agentType: string;
  isExpanded: boolean;
  onToggle: () => void;
  onSendMessage: (message: string) => void;
  isPrimary?: boolean;
}

export function CollapsibleAgentCard({
  agent,
  agentType,
  isExpanded,
  onToggle,
  onSendMessage,
  isPrimary = false,
}: CollapsibleAgentCardProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const config = AGENT_CONFIG[agentType] || { emoji: '🤖', label: 'Agent', color: 'var(--orange)' };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isExpanded) {
      scrollToBottom();
    }
  }, [agent.messages, isExpanded]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || agent.status === 'thinking') return;

    onSendMessage(input.trim());
    setInput('');
  };

  const getStatusLabel = () => {
    switch (agent.status) {
      case 'idle': return 'Ready';
      case 'thinking': return 'Working...';
      case 'error': return 'Error';
      case 'closed': return 'Closed';
      default: return 'Unknown';
    }
  };

  const lastMessage = agent.messages.filter(m => m.role === 'assistant' && !m.isPartial).pop();
  const previewText = lastMessage?.content?.slice(0, 80) || 'No messages yet';

  return (
    <div
      className={`collapsible-agent-card ${isExpanded ? 'expanded' : ''} ${agent.status === 'thinking' ? 'thinking' : ''} ${isPrimary ? 'primary' : ''}`}
      style={{ '--agent-color': config.color } as React.CSSProperties}
    >
      <button className="agent-card-header" onClick={onToggle}>
        <div className="agent-card-left">
          <span className="agent-card-emoji">{config.emoji}</span>
          <div className="agent-card-info">
            <span className="agent-card-label">{config.label}</span>
            {!isExpanded && (
              <span className="agent-card-preview">{previewText}</span>
            )}
          </div>
        </div>

        <div className="agent-card-right">
          <div className={`agent-card-status status-${agent.status}`}>
            <span className="status-indicator" />
            {getStatusLabel()}
          </div>
          <span className={`agent-card-chevron ${isExpanded ? 'expanded' : ''}`}>
            ▾
          </span>
        </div>
      </button>

      <div
        ref={contentRef}
        className="agent-card-content"
        style={{
          maxHeight: isExpanded ? '600px' : '0',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="agent-card-messages">
          {agent.messages.length === 0 ? (
            <div className="agent-card-empty">
              <span>{config.emoji}</span>
              <p>Waiting for instructions...</p>
            </div>
          ) : (
            agent.messages.map((message) => {
              if (message.role === 'tool' && message.toolName) {
                type ToolCategory = 'orchestration' | 'file' | 'search' | 'web' | 'system';

                const getToolDisplay = (name: string, input?: Record<string, unknown>) => {
                  const baseName = name.replace(/^mcp(__mandu)?__/, '');

                  const toolMap: Record<string, {
                    icon: string;
                    label: string;
                    category: ToolCategory;
                    getDesc?: (i: Record<string, unknown>) => string
                  }> = {
                    'create_task': {
                      icon: '◆',
                      label: 'DISPATCH',
                      category: 'orchestration',
                      getDesc: (i) => i.assignedAgent ? `Activating ${String(i.assignedAgent).toUpperCase()} agent` : 'Creating task'
                    },
                    'complete_task': { icon: '✓', label: 'COMPLETE', category: 'orchestration' },
                    'update_task': { icon: '↻', label: 'UPDATE', category: 'orchestration' },
                    'create_artifact': {
                      icon: '❖',
                      label: 'ARTIFACT',
                      category: 'orchestration',
                      getDesc: (i) => i.name ? String(i.name) : 'Saving output'
                    },
                    'create_gate': { icon: '⊡', label: 'GATE', category: 'orchestration', getDesc: () => 'Awaiting approval' },
                    'list_tasks': { icon: '≡', label: 'QUERY', category: 'orchestration', getDesc: () => 'Fetching tasks' },
                    'list_pending_gates': { icon: '⊡', label: 'QUERY', category: 'orchestration', getDesc: () => 'Checking gates' },
                    'get_project_status': { icon: '◎', label: 'STATUS', category: 'orchestration' },
                    'get_task': { icon: '◇', label: 'FETCH', category: 'orchestration' },
                    'get_artifact': { icon: '❖', label: 'LOAD', category: 'orchestration' },
                    'Read': {
                      icon: '▸',
                      label: 'READ',
                      category: 'file',
                      getDesc: (i) => i.file_path ? String(i.file_path).split('/').pop() || '' : ''
                    },
                    'Write': {
                      icon: '◂',
                      label: 'WRITE',
                      category: 'file',
                      getDesc: (i) => i.file_path ? String(i.file_path).split('/').pop() || '' : ''
                    },
                    'Edit': {
                      icon: '⟡',
                      label: 'EDIT',
                      category: 'file',
                      getDesc: (i) => i.file_path ? String(i.file_path).split('/').pop() || '' : ''
                    },
                    'Bash': {
                      icon: '⌘',
                      label: 'EXEC',
                      category: 'system',
                      getDesc: (i) => {
                        if (i.command) {
                          const cmd = String(i.command).trim();
                          // Show first 40 chars of command
                          return cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd;
                        }
                        return '';
                      }
                    },
                    'Task': {
                      icon: '◆',
                      label: 'TASK',
                      category: 'orchestration',
                      getDesc: (i) => {
                        if (i.description) return String(i.description).slice(0, 40);
                        if (i.prompt) return String(i.prompt).slice(0, 40) + '...';
                        return 'Spawning agent';
                      }
                    },
                    'Glob': {
                      icon: '⌕',
                      label: 'GLOB',
                      category: 'search',
                      getDesc: (i) => i.pattern ? String(i.pattern) : ''
                    },
                    'Grep': {
                      icon: '⌕',
                      label: 'GREP',
                      category: 'search',
                      getDesc: (i) => i.pattern ? String(i.pattern).slice(0, 30) : ''
                    },
                    'WebSearch': { icon: '◉', label: 'SEARCH', category: 'web', getDesc: (i) => i.query ? String(i.query).slice(0, 40) : '' },
                    'WebFetch': { icon: '↓', label: 'FETCH', category: 'web', getDesc: (i) => i.url ? String(i.url).split('/').pop() || '' : '' },
                  };

                  const tool = toolMap[baseName] || toolMap[name];
                  if (tool) {
                    const desc = tool.getDesc && input ? tool.getDesc(input) : '';
                    return { ...tool, desc };
                  }

                  const cleanName = baseName.replace(/_/g, ' ');
                  return {
                    icon: '○',
                    label: cleanName.toUpperCase().slice(0, 8),
                    desc: '',
                    category: 'system' as ToolCategory
                  };
                };

                const toolDisplay = getToolDisplay(message.toolName, message.toolInput);

                return (
                  <div
                    key={message.id}
                    className={`tool-activity tool-category-${toolDisplay.category}`}
                  >
                    <div className="tool-activity-indicator">
                      <span className="tool-activity-pulse" />
                    </div>
                    <span className="tool-activity-icon">{toolDisplay.icon}</span>
                    <span className="tool-activity-label">{toolDisplay.label}</span>
                    {toolDisplay.desc && (
                      <>
                        <span className="tool-activity-separator">→</span>
                        <span className="tool-activity-desc">{toolDisplay.desc}</span>
                      </>
                    )}
                  </div>
                );
              }

              if (message.role === 'tool' && message.isToolResult) {
                return null; // Hide tool results for cleaner view
              }

              return (
                <div
                  key={message.id}
                  className={`card-message card-message-${message.role} ${message.isPartial ? 'partial' : ''}`}
                >
                  {message.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    message.content
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {isPrimary && (
          <form className="agent-card-input" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={agent.status === 'thinking' ? 'Agent is working...' : 'Send a message...'}
              disabled={agent.status === 'thinking'}
            />
            <button
              type="submit"
              disabled={!input.trim() || agent.status === 'thinking'}
            >
              →
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
