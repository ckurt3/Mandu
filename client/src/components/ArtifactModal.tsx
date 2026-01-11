import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Artifact, ArtifactType, Gate } from '../types';

// Icon mapping for artifact types
const ARTIFACT_ICONS: Record<ArtifactType, string> = {
  spec: '📋',
  design_doc: '🏗️',
  code_change: '💻',
  test_report: '🧪',
  markdown: '📝',
};

interface ArtifactModalProps {
  artifact: Artifact | null;
  onClose: () => void;
  // Optional gate review integration
  gate?: Gate | null;
  gateComment?: string;
  onGateCommentChange?: (comment: string) => void;
  onResolveGate?: (
    gateId: string,
    status: 'approved' | 'changes_requested',
    comment?: string
  ) => void;
}

export function ArtifactModal({
  artifact,
  onClose,
  gate,
  gateComment = '',
  onGateCommentChange,
  onResolveGate,
}: ArtifactModalProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (artifact) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [artifact, onClose]);

  if (!artifact) return null;

  const icon = ARTIFACT_ICONS[artifact.type] || '📄';
  const showGateActions = gate && gate.artifactIds?.includes(artifact._id) && onResolveGate;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 animate-modal-fade"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[900px] max-h-[92vh] bg-bg-elevated border border-border rounded-2xl flex flex-col overflow-hidden shadow-modal animate-modal-slide"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 bg-bg-secondary border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wide text-[#A78BFA] mb-0.5">
                {artifact.type.replace('_', ' ')}
              </span>
              <h2 className="text-base font-bold text-text-primary leading-tight">
                {artifact.name}
              </h2>
            </div>
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {artifact.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between px-5 py-3 bg-bg-secondary border-t border-border">
          <span className="text-xs text-text-muted">
            Created by {artifact.createdBy}
          </span>
          <button
            className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </footer>

        {/* Review Actions - only show if this artifact is part of a pending gate */}
        {showGateActions && (
          <div className="px-5 py-4 bg-bg-primary border-t border-orange/30">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-orange mb-3">
              <span>⚡</span>
              <span>Submit Review</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={gateComment}
                onChange={(e) => onGateCommentChange?.(e.target.value)}
                placeholder="Feedback (required for changes)..."
                className="
                  flex-1 bg-bg-elevated border border-border rounded-lg px-4 py-2.5
                  text-sm text-text-primary placeholder:text-text-muted
                  focus:outline-none focus:border-orange/50 focus:ring-1 focus:ring-orange/10
                  transition-all
                "
              />
              <button
                onClick={() => {
                  onResolveGate(gate._id, 'approved', gateComment || undefined);
                  onClose();
                }}
                className="
                  px-4 py-2.5 rounded-lg font-bold text-sm
                  bg-green/15 text-green border border-green/30
                  hover:bg-green/25 hover:border-green/40
                  active:scale-[0.98] transition-all flex items-center gap-1.5
                "
              >
                <span>✓</span>
                <span>Approve</span>
              </button>
              <button
                onClick={() => {
                  onResolveGate(gate._id, 'changes_requested', gateComment);
                  onClose();
                }}
                disabled={!gateComment.trim()}
                className="
                  px-4 py-2.5 rounded-lg font-bold text-sm
                  bg-bg-elevated border border-border text-text-secondary
                  hover:bg-golden/10 hover:text-golden hover:border-golden/40
                  disabled:opacity-40 disabled:cursor-not-allowed
                  active:scale-[0.98] transition-all flex items-center gap-1.5
                "
                title={!gateComment.trim() ? 'Add feedback to request changes' : ''}
              >
                <span>↻</span>
                <span>Request Changes</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
