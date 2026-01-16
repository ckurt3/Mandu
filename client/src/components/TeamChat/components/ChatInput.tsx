import { FormEvent, KeyboardEvent, RefObject, DragEvent } from 'react';
import type { AttachedFile, SlashCommand } from '../types';
import { CommandPalette } from './CommandPalette';

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  isDisabled: boolean;
  inputRef: RefObject<HTMLInputElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  attachedFiles: AttachedFile[];
  onRemoveFile: (id: string) => void;
  onFileSelect: (files: File[]) => void;
  isDragging: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  showCommandPalette: boolean;
  filteredCommands: SlashCommand[];
  selectedCommandIndex: number;
  onSelectCommand: (command: SlashCommand) => void;
  isConnected?: boolean;
}

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  onKeyDown,
  isDisabled,
  inputRef,
  fileInputRef,
  attachedFiles,
  onRemoveFile,
  onFileSelect,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  showCommandPalette,
  filteredCommands,
  selectedCommandIndex,
  onSelectCommand,
  isConnected = true,
}: ChatInputProps) {
  return (
    <div
      className={`flex-shrink-0 border-t bg-bg-secondary/50 backdrop-blur-sm transition-colors ${isDragging ? 'border-orange bg-orange/5' : 'border-border'}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <form
        className="max-w-3xl mx-auto px-4 py-4 relative"
        onSubmit={onSubmit}
      >
        {/* Command Palette */}
        {showCommandPalette && (
          <CommandPalette
            commands={filteredCommands}
            selectedIndex={selectedCommandIndex}
            onSelectCommand={onSelectCommand}
          />
        )}

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
                  onClick={() => onRemoveFile(file.id)}
                  className="opacity-50 hover:opacity-100 text-text-muted hover:text-red transition-all"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 bg-bg-elevated border border-border rounded-xl px-4 py-2 transition-all focus-within:border-orange/50 focus-within:ring-2 focus-within:ring-orange/10">
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
                onFileSelect(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
            accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.css,.html,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.yml,.yaml,.toml,.xml,.csv,.sh"
          />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isDragging ? 'Drop files here...' : (isDisabled ? 'Team is working...' : 'Message your team...')}
            disabled={isDisabled}
            className="
              flex-1 h-[38px] bg-transparent border-none outline-none
              text-sm text-text-primary placeholder:text-text-muted
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          />
          <button
            type="submit"
            disabled={(!input.trim() && attachedFiles.length === 0) || isDisabled}
            className="
              w-[38px] h-[38px] flex items-center justify-center
              bg-orange hover:bg-orange-dark active:scale-95
              text-white rounded-lg font-bold text-base
              transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
        <div className="keyboard-hints mt-2 px-1 justify-between">
          <div className="flex gap-4">
            <span className="hint"><kbd className="command-kbd">Enter</kbd> send</span>
            <span className="hint">Drop files to attach</span>
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
  );
}
