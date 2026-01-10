import { useState, useRef, useEffect, FormEvent, KeyboardEvent, ChangeEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentState } from '../types';

const DUMPLING_AVATARS = ['🥟', '🫓', '🥠', '🍜', '🍥', '🥡'];

interface AgentPanelProps {
  agent: AgentState;
  index: number;
  onSendMessage: (message: string) => void;
  onClose: () => void;
  hideClose?: boolean;
  title?: string;
}

export function AgentPanel({ agent, index, onSendMessage, onClose, hideClose, title }: AgentPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const avatar = DUMPLING_AVATARS[index % DUMPLING_AVATARS.length];
  const shortId = agent.id.split('-').slice(-1)[0];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [agent.messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || agent.status === 'thinking') return;

    onSendMessage(input.trim());
    setInput('');
    // Reset textarea height after submit
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter without Shift submits the form
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
    // Shift+Enter allows newline (default behavior)
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-expand textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  };

  const getStatusLabel = () => {
    switch (agent.status) {
      case 'idle':
        return 'Ready';
      case 'thinking':
        return 'Cooking...';
      case 'error':
        return 'Error';
      case 'closed':
        return 'Closed';
      default:
        return 'Unknown';
    }
  };

  const panelClasses = [
    'agent-panel',
    agent.status === 'thinking' ? 'thinking' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={panelClasses}>
      <div className="agent-header">
        <div className="agent-title">
          <span className="agent-avatar">{avatar}</span>
          <div className="agent-info">
            <h3>{title || `Agent #${index + 1}`}</h3>
            <span className="agent-id">{shortId}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className={`status-badge status-${agent.status}`}>
            <span className="status-dot" />
            {getStatusLabel()}
          </div>
          {!hideClose && (
            <button
              className="close-btn"
              onClick={onClose}
              title="Close agent"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="messages">
        {agent.messages.length === 0 ? (
          <div className="empty-state" style={{ height: '100%', padding: '20px' }}>
            <span className="empty-icon" style={{ fontSize: '48px' }}>{avatar}</span>
            <h2 style={{ fontSize: '16px', marginTop: '12px' }}>Fresh out of the steamer!</h2>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>Send a message to start working with this agent.</p>
          </div>
        ) : (
          agent.messages.map((message) => {
            // Tool use message
            if (message.role === 'tool' && message.toolName) {
              const getToolIcon = (name: string) => {
                const icons: Record<string, string> = {
                  Read: '📖', Write: '✏️', Edit: '🔧', Bash: '💻',
                  Glob: '🔍', Grep: '🔎', WebSearch: '🌐', WebFetch: '📥',
                };
                return icons[name] || '⚙️';
              };

              const getInputPreview = (input: Record<string, unknown>) => {
                if (!input || Object.keys(input).length === 0) return '';
                // Task tool - show description or prompt
                if (input.description) return String(input.description);
                if (input.prompt) return String(input.prompt).slice(0, 100);
                // File operations
                if (input.file_path) return String(input.file_path);
                // Bash - show command
                if (input.command) return String(input.command).slice(0, 80);
                // Search tools
                if (input.pattern) return String(input.pattern);
                if (input.query) return String(input.query);
                if (input.url) return String(input.url);
                // Fallback: show first key-value pair
                const firstKey = Object.keys(input)[0];
                if (firstKey) {
                  const val = String(input[firstKey]).slice(0, 80);
                  return `${firstKey}: ${val}`;
                }
                return '';
              };

              return (
                <div key={message.id} className="message message-tool">
                  <span className="tool-icon">{getToolIcon(message.toolName)}</span>
                  <div className="tool-info">
                    <span className="tool-name">{message.toolName}</span>
                    <span className="tool-input">{getInputPreview(message.toolInput || {})}</span>
                  </div>
                </div>
              );
            }

            // Tool result message
            if (message.role === 'tool' && message.isToolResult) {
              // Try to parse MCP tool result JSON
              let resultDisplay: React.ReactNode;
              try {
                const result = JSON.parse(message.content);
                if (result.success === true) {
                  const displayMessage = result.message || 'Completed successfully';
                  resultDisplay = (
                    <div className="tool-result-success">
                      <span className="tool-result-icon">✓</span>
                      <span>{displayMessage}</span>
                    </div>
                  );
                } else if (result.success === false) {
                  resultDisplay = (
                    <div className="tool-result-error">
                      <span className="tool-result-icon">✗</span>
                      <span>{result.error || 'Failed'}</span>
                    </div>
                  );
                } else {
                  // Non-MCP tool result, show raw
                  resultDisplay = <pre>{message.content}</pre>;
                }
              } catch {
                // Not JSON, show raw content
                resultDisplay = <pre>{message.content}</pre>;
              }
              return (
                <div key={message.id} className="message message-tool-result">
                  {resultDisplay}
                </div>
              );
            }

            // Regular messages
            return (
              <div
                key={message.id}
                className={`message message-${message.role} ${message.isPartial ? 'message-partial' : ''}`}
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

      <form className="input-area" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={agent.status === 'thinking' ? 'Agent is thinking...' : 'Type a message...'}
          disabled={agent.status === 'thinking' || agent.status === 'closed'}
          rows={1}
        />
        <button
          type="submit"
          className="send-btn"
          disabled={!input.trim() || agent.status === 'thinking' || agent.status === 'closed'}
        >
          →
        </button>
      </form>
    </div>
  );
}
