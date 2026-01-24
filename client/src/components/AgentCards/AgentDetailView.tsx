import { useState, useRef, useEffect, FormEvent, KeyboardEvent, DragEvent, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { AGENT_CONFIG } from '../TeamChat/constants';
import { MessageGroup } from '../TeamChat/components/MessageGroup';
import { TypingIndicator } from '../TeamChat/components/TypingIndicator';
import { ToolCard } from '../TeamChat/components/ToolCard';
import type { ChatMessage, AgentWithType, AttachedFile } from '../TeamChat/types';
import { useFileAttachments } from '../TeamChat/hooks/useFileAttachments';

import type { AgentDetailViewProps, ExtendedAgentStatus } from './types';

/**
 * Status config for the header
 */
const STATUS_CONFIG: Record<ExtendedAgentStatus, { color: string; borderColor: string; label: string; pulse: boolean }> = {
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

export function AgentDetailView({
  agent,
  onBack,
  onSendMessage,
  onPause,
  onResume,
  isConnected = true,
}: AgentDetailViewProps) {
  const config = AGENT_CONFIG[agent.agentType] || AGENT_CONFIG.em;
  const statusConfig = STATUS_CONFIG[agent.status];

  const [input, setInput] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const animatedMessagesRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File attachments hook
  const {
    attachedFiles,
    isDragging,
    setIsDragging,
    handleFileDrop,
    processFiles,
    removeFile,
    clearFiles,
  } = useFileAttachments();

  // Convert messages to the format expected by MessageGroup
  const chatMessages: ChatMessage[] = useMemo(() => {
    return agent.messages.map((msg, idx) => ({
      id: msg.id || `${agent.id}-${idx}`,
      agentType: msg.role === 'user' ? 'user' : agent.agentType,
      role: msg.role,
      content: msg.content,
      toolName: msg.toolName,
      toolInput: msg.toolInput,
      toolResult: msg.toolResult,
      isPartial: msg.isPartial,
      isToolResult: msg.isToolResult,
      timestamp: msg.timestamp || 0,
    }));
  }, [agent.messages, agent.id, agent.agentType]);

  // Group consecutive messages from same sender
  const groupedMessages = useMemo(() => {
    const groups: Array<{ agentType: string; messages: ChatMessage[] }> = [];
    for (const msg of chatMessages) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.agentType === msg.agentType) {
        lastGroup.messages.push(msg);
      } else {
        groups.push({
          agentType: msg.agentType,
          messages: [msg],
        });
      }
    }
    return groups;
  }, [chatMessages]);

  // Create agent lookup for MessageGroup
  const agentsByType = useMemo(() => {
    const map = new Map<string, AgentWithType>();
    map.set(agent.agentType, {
      agent: {
        id: agent.id,
        status: agent.status === 'working' ? 'thinking' : 'idle',
        messages: agent.messages,
      },
      type: agent.agentType,
    });
    return map;
  }, [agent]);

  // Calculate TODO progress
  const totalTodos = agent.todos.length;
  const completedTodos = agent.todos.filter(t => t.status === 'completed').length;
  const currentTodo = agent.todos.find(t => t.status === 'in_progress');
  const progressPercent = totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Handle form submission - always enabled even when paused
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const currentFiles = [...attachedFiles];
    if (!input.trim() && currentFiles.length === 0) return;

    const images = currentFiles.filter(f => f.type === 'image').map(f => f.dataUrl!);
    const pdfs = currentFiles.filter(f => f.type === 'pdf').map(f => ({ name: f.name, dataUrl: f.dataUrl! }));
    const textFiles = currentFiles.filter(f => f.type === 'text').map(f => ({ name: f.name, content: f.content! }));

    if (images.length > 0 || pdfs.length > 0 || textFiles.length > 0) {
      onSendMessage({
        text: input.trim(),
        images,
        pdfs,
        textFiles,
      });
    } else {
      onSendMessage(input.trim());
    }

    setInput('');
    clearFiles();
  };

  // Handle drag events
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Toggle tool expansion
  const toggleToolExpand = (id: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Track animated messages
  const handleMessageAnimated = (id: string) => {
    animatedMessagesRef.current.add(id);
  };

  const isPaused = agent.status === 'paused';
  const isWorking = agent.status === 'working';

  return (
    <div className="flex flex-col h-full animate-slide-in-left">
      {/* Header with back button and agent info */}
      <div className="flex-shrink-0 border-b border-border bg-bg-secondary/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-text-muted hover:text-orange hover:border-orange/30 hover:bg-orange/5 transition-all"
            aria-label="Back to grid"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Agent Avatar */}
          <div className={`
            w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0
            ${config.bgColor} ${config.borderColor} border
          `}>
            {config.emoji}
          </div>

          {/* Agent Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm ${config.textColor}`}>
                {agent.displayName}
              </span>
              {agent.isPrimary && (
                <span className="px-1.5 py-0.5 rounded bg-orange/15 text-[9px] font-bold text-orange uppercase tracking-wide">
                  Primary
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className={`
                w-2 h-2 rounded-full ${statusConfig.color}
                ${statusConfig.pulse ? 'animate-pulse' : ''}
              `} />
              <span className="text-xs text-text-muted">{statusConfig.label}</span>
            </div>
          </div>

          {/* Pause/Resume Button */}
          <div className="flex items-center gap-2">
            {isPaused ? (
              <button
                onClick={() => onResume()}
                className="px-3 py-1.5 rounded-lg bg-green/15 border border-green/30 text-green text-xs font-semibold hover:bg-green/25 transition-all flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Resume
              </button>
            ) : isWorking ? (
              <button
                onClick={onPause}
                className="px-3 py-1.5 rounded-lg bg-[#FBBF24]/15 border border-[#FBBF24]/30 text-[#FBBF24] text-xs font-semibold hover:bg-[#FBBF24]/25 transition-all flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                Pause
              </button>
            ) : null}
          </div>
        </div>

        {/* TODO Progress Bar (if has todos) */}
        {totalTodos > 0 && (
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                Progress
              </span>
              <span className="text-[10px] font-mono text-text-secondary">
                {completedTodos}/{totalTodos} tasks
              </span>
            </div>
            <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  progressPercent === 100 ? 'bg-green' : 'bg-[#3B82F6]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {currentTodo && (
              <div className="mt-2 text-xs text-text-secondary flex items-center gap-1.5">
                <span className="text-[#3B82F6] animate-pulse">●</span>
                {currentTodo.activeForm}
              </div>
            )}
          </div>
        )}

        {/* Queued Messages Banner */}
        {agent.queuedMessages.length > 0 && (
          <div className="px-4 pb-3">
            <div className="px-3 py-2 rounded-lg bg-[#FBBF24]/10 border border-[#FBBF24]/20 text-xs text-[#FBBF24] flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{agent.queuedMessages.length} message{agent.queuedMessages.length !== 1 ? 's' : ''} queued - will be sent when resumed</span>
            </div>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-5 py-4">
          {groupedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <div className={`
                w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4
                ${config.bgColor} ${config.borderColor} border
              `}>
                {config.emoji}
              </div>
              <p className="text-sm text-text-secondary mb-1">No messages yet</p>
              <p className="text-xs text-text-muted">
                Send a message to start the conversation
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groupedMessages.map((group, idx) => (
                <MessageGroup
                  key={idx}
                  agentType={group.agentType}
                  messages={group.messages}
                  expandedTools={expandedTools}
                  onToggleToolExpand={toggleToolExpand}
                  onSelectAgent={() => {}} // No nested navigation
                  agentsByType={agentsByType}
                  animatedMessages={animatedMessagesRef.current}
                  onMessageAnimated={handleMessageAnimated}
                />
              ))}

              {/* Typing Indicator */}
              {isWorking && (
                <TypingIndicator agentType={agent.agentType} />
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area - Always enabled (queues if paused) */}
      <div
        className={`flex-shrink-0 border-t bg-bg-secondary/50 backdrop-blur-sm transition-colors ${
          isDragging ? 'border-orange bg-orange/5' : 'border-border'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleFileDrop}
      >
        <form className="max-w-3xl mx-auto px-4 py-4" onSubmit={handleSubmit}>
          {/* File Previews */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachedFiles.map(file => (
                <div
                  key={file.id}
                  className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-elevated border border-border text-sm"
                >
                  {file.type === 'image' && file.dataUrl && (
                    <img src={file.dataUrl} alt={file.name} className="w-8 h-8 rounded object-cover" />
                  )}
                  {file.type === 'pdf' && (
                    <span className="w-8 h-8 flex items-center justify-center bg-red/10 text-red rounded text-xs font-bold">PDF</span>
                  )}
                  {file.type === 'text' && (
                    <span className="w-8 h-8 flex items-center justify-center bg-blue-500/10 text-blue-400 rounded text-xs font-bold">TXT</span>
                  )}
                  <span className="text-text-secondary truncate max-w-[120px]">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="opacity-50 hover:opacity-100 text-text-muted hover:text-red transition-all"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={`
            flex items-center gap-3 bg-bg-elevated border rounded-xl px-4 py-2 transition-all
            ${isPaused ? 'border-[#FBBF24]/30' : 'border-border'}
            focus-within:border-orange/50 focus-within:ring-2 focus-within:ring-orange/10
          `}>
            {/* Attach File Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-[38px] h-[38px] flex items-center justify-center text-text-muted hover:text-orange transition-colors rounded-lg hover:bg-orange/10"
              title="Attach files"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  processFiles(Array.from(e.target.files));
                  e.target.value = '';
                }
              }}
              accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.css,.html,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.yml,.yaml,.toml,.xml,.csv,.sh"
            />

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isPaused
                  ? 'Type a message (will be queued)...'
                  : isDragging
                    ? 'Drop files here...'
                    : `Message ${agent.displayName}...`
              }
              className="
                flex-1 h-[38px] bg-transparent border-none outline-none
                text-sm text-text-primary placeholder:text-text-muted
              "
            />

            <button
              type="submit"
              disabled={!input.trim() && attachedFiles.length === 0}
              className={`
                w-[38px] h-[38px] flex items-center justify-center
                rounded-lg font-bold text-base
                transition-all duration-150
                disabled:opacity-40 disabled:cursor-not-allowed
                ${isPaused
                  ? 'bg-[#FBBF24] hover:bg-[#F59E0B] text-black'
                  : 'bg-orange hover:bg-orange-dark active:scale-95 text-white'
                }
              `}
            >
              {isPaused ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              )}
            </button>
          </div>

          <div className="keyboard-hints mt-2 px-1 justify-between">
            <div className="flex gap-4">
              <span className="hint">
                <kbd className="command-kbd">Enter</kbd>
                {isPaused ? ' queue' : ' send'}
              </span>
              {isPaused && (
                <span className="hint text-[#FBBF24]">Messages queued while paused</span>
              )}
            </div>
            {/* Connection Status Indicator */}
            <div className={`
              flex items-center gap-1.5 text-[10px] font-medium
              ${isConnected ? 'text-green' : 'text-red'}
            `}>
              <span className={`
                w-1.5 h-1.5 rounded-full flex-shrink-0
                ${isConnected ? 'bg-green animate-pulse' : 'bg-red'}
              `} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
