import { useState, useRef, useEffect, useMemo, FormEvent, KeyboardEvent, DragEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Artifact } from '@shared/types';

import { AGENT_CONFIG } from './constants';
import type { TeamChatProps, ChatMessage, AgentWithType, SlashCommand } from './types';

import { useCommandPalette } from './hooks/useCommandPalette';
import { useMessageHistory } from './hooks/useMessageHistory';
import { useFileAttachments } from './hooks/useFileAttachments';

import { MessageGroup } from './components/MessageGroup';
import { TypingIndicator } from './components/TypingIndicator';
import { EmptyState } from './components/EmptyState';
import { ChatInput } from './components/ChatInput';
import { GateApprovalBar } from './components/GateApprovalBar';
import { AgentDetailModal } from './components/AgentDetailModal';

import { ArtifactModal } from '../ArtifactModal';

export function TeamChat({
  agents,
  onSendMessage,
  projectName,
  projectId,
  gates,
  artifacts,
  onResolveGate,
  onLoadEarlierMessages,
  isConnected = true,
}: TeamChatProps) {
  const [input, setInput] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [selectedAgentType, setSelectedAgentType] = useState<string | null>(null);
  const animatedMessagesRef = useRef<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gate approval state
  const [gateComment, setGateComment] = useState('');
  const [viewingArtifact, setViewingArtifact] = useState<Artifact | null>(null);

  // Create a map of active agents by type
  const agentsByType = useMemo(() => {
    const map = new Map<string, AgentWithType>();
    for (const a of agents) {
      map.set(a.type, a);
    }
    return map;
  }, [agents]);

  // Merge all agent messages into a single timeline sorted by actual timestamp
  const chatMessages = useMemo(() => {
    const allMessages: ChatMessage[] = [];

    for (const { agent, type } of agents) {
      for (const msg of agent.messages) {
        allMessages.push({
          id: `${agent.id}-${msg.id}`,
          agentType: msg.role === 'user' ? 'user' : type,
          role: msg.role,
          content: msg.content,
          toolName: msg.toolName,
          toolInput: msg.toolInput,
          toolResult: msg.toolResult,
          isPartial: msg.isPartial,
          isToolResult: msg.isToolResult,
          timestamp: msg.timestamp || 0,
        });
      }
    }

    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }, [agents]);

  // Group consecutive messages from same agent
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

  const isAnyWorking = agents.some(a => a.agent.status === 'thinking');

  // Custom hooks
  const {
    showCommandPalette,
    filteredCommands,
    selectedCommandIndex,
    handleInputChange: handleCommandPaletteInput,
    handleKeyDown: handleCommandPaletteKeyDown,
  } = useCommandPalette({ inputRef: inputRef as React.RefObject<HTMLInputElement> });

  const {
    hiddenMessageCount,
    isLoadingMore,
    loadEarlierMessages,
  } = useMessageHistory({
    projectId,
    currentMessageCount: chatMessages.length,
    onLoadEarlierMessages,
  });

  const {
    attachedFiles,
    isDragging,
    setIsDragging,
    handleFileDrop,
    processFiles,
    removeFile,
    clearFiles,
  } = useFileAttachments();

  // Check if EM is initializing
  const emAgent = agentsByType.get('em');
  const isEMInitializing = emAgent?.agent.status === 'thinking' && emAgent.agent.messages.length === 0;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Handle form submission
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const currentFiles = [...attachedFiles];
    if ((!input.trim() && currentFiles.length === 0) || isAnyWorking) return;

    const images = currentFiles.filter(f => f.type === 'image').map(f => f.dataUrl!);
    const pdfs = currentFiles.filter(f => f.type === 'pdf').map(f => ({ name: f.name, dataUrl: f.dataUrl! }));
    const textFiles = currentFiles.filter(f => f.type === 'text').map(f => ({ name: f.name, content: f.content! }));

    onSendMessage({
      text: input.trim(),
      images,
      pdfs,
      textFiles,
    });

    setInput('');
    clearFiles();
  };

  // Handle input changes (with command palette support)
  const handleInputChange = (value: string) => {
    handleCommandPaletteInput(value, setInput);
  };

  // Handle keyboard events
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    handleCommandPaletteKeyDown(e, setInput);
  };

  // Handle drag events
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Handle command selection from palette
  const handleSelectCommand = (command: SlashCommand) => {
    setInput(command.name + ' ');
    inputRef.current?.focus();
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

  // Track animated messages (only animate once on first appearance)
  const handleMessageAnimated = (id: string) => {
    animatedMessagesRef.current.add(id);
  };

  // Get pending gate and related artifacts
  const pendingGate = gates.find(g => g.status === 'pending');
  const pendingGateArtifacts = pendingGate
    ? artifacts.filter(a => a.runId === pendingGate.runId)
    : [];

  // Get selected agent info for modal
  const selectedAgent = selectedAgentType ? agentsByType.get(selectedAgentType) : null;
  const selectedConfig = selectedAgentType ? AGENT_CONFIG[selectedAgentType] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Chat Messages - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        <div className={`max-w-3xl mx-auto px-5 py-4 w-full ${groupedMessages.length === 0 && !pendingGate ? 'flex-1 flex flex-col justify-center' : ''}`}>
          {groupedMessages.length === 0 && !pendingGate ? (
            <EmptyState
              isInitializing={isEMInitializing}
              projectName={projectName}
            />
          ) : (
            <div className="flex flex-col gap-5">
              {/* Load Earlier Messages Button */}
              {hiddenMessageCount > 0 && (
                <button
                  onClick={loadEarlierMessages}
                  disabled={isLoadingMore}
                  className="load-earlier-btn"
                >
                  {isLoadingMore ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-orange/30 border-t-orange rounded-full animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    <span>
                      Load <span className="count">{hiddenMessageCount}</span> earlier message{hiddenMessageCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              )}

              {/* Message Groups */}
              {groupedMessages.map((group, idx) => (
                <MessageGroup
                  key={idx}
                  agentType={group.agentType}
                  messages={group.messages}
                  expandedTools={expandedTools}
                  onToggleToolExpand={toggleToolExpand}
                  onSelectAgent={setSelectedAgentType}
                  agentsByType={agentsByType}
                  animatedMessages={animatedMessagesRef.current}
                  onMessageAnimated={handleMessageAnimated}
                />
              ))}

              {/* Pending Gate Card - In Chat */}
              {pendingGate && (
                <div className="flex gap-3 animate-fade-in-up">
                  <div className="w-9 h-9 rounded-xl bg-orange/15 border border-orange/30 flex items-center justify-center text-lg flex-shrink-0 animate-pulse-glow">
                    🥟
                  </div>
                  <div className="flex flex-col gap-1.5 max-w-[75%] min-w-0">
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-bold text-orange">Mandu</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-orange/20 text-[9px] font-bold text-orange uppercase tracking-wide">
                        needs review
                      </span>
                    </div>
                    <div className="assistant-message-card border-orange/30 rounded-tl-sm p-4">
                      <h4 className="text-sm font-bold text-text-primary mb-2">{pendingGate.title}</h4>
                      {pendingGate.description && (
                        <div className="chat-markdown text-sm">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {pendingGate.description}
                          </ReactMarkdown>
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-text-muted font-mono">
                        Gate type: <span className="text-orange font-semibold">{pendingGate.type}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Typing Indicators */}
              {agents
                .filter(({ agent }) => agent.status === 'thinking')
                .map(({ agent, type }) => (
                  <TypingIndicator key={`typing-${agent.id}`} agentType={type} />
                ))}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area - Either pending gate approval or chat input */}
      {pendingGate ? (
        <GateApprovalBar
          gate={pendingGate}
          artifacts={pendingGateArtifacts}
          comment={gateComment}
          onCommentChange={setGateComment}
          onResolve={(gateId, status, comment) => {
            onResolveGate(gateId, status, comment);
            setGateComment('');
          }}
          onViewArtifact={setViewingArtifact}
        />
      ) : (
        <ChatInput
          input={input}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          isDisabled={isAnyWorking}
          inputRef={inputRef as React.RefObject<HTMLInputElement>}
          fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
          attachedFiles={attachedFiles}
          onRemoveFile={removeFile}
          onFileSelect={processFiles}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleFileDrop}
          showCommandPalette={showCommandPalette}
          filteredCommands={filteredCommands}
          selectedCommandIndex={selectedCommandIndex}
          onSelectCommand={handleSelectCommand}
          isConnected={isConnected}
        />
      )}

      {/* Agent Detail Modal */}
      {selectedAgentType && selectedConfig && (
        <AgentDetailModal
          agentType={selectedAgentType}
          config={selectedConfig}
          agent={selectedAgent || null}
          onClose={() => setSelectedAgentType(null)}
        />
      )}

      {/* Artifact Viewing Modal */}
      <ArtifactModal
        artifact={viewingArtifact}
        onClose={() => setViewingArtifact(null)}
        gate={pendingGate}
        gateComment={gateComment}
        onGateCommentChange={setGateComment}
        onResolveGate={(gateId, status, comment) => {
          onResolveGate(gateId, status, comment);
          setGateComment('');
        }}
      />
    </div>
  );
}

// Re-export types for convenience
export type { TeamChatProps, ChatMessage, AgentWithType } from './types';
