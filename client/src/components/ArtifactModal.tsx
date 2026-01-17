import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Artifact, ArtifactType, Gate } from '@shared/types';

// Icon mapping for artifact types
const ARTIFACT_ICONS: Record<ArtifactType, string> = {
  spec: '📋',
  design_doc: '🏗️',
  code_change: '💻',
  test_report: '🧪',
  review: '🔍',
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
    status: 'approved' | 'rejected',
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
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch artifact content if not available
  useEffect(() => {
    if (artifact && !artifact.content && !fetchedContent && !isLoading) {
      setIsLoading(true);
      fetch(`/api/artifacts/${artifact.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.artifact?.content) {
            setFetchedContent(data.artifact.content);
          }
        })
        .catch(err => console.error('Failed to fetch artifact content:', err))
        .finally(() => setIsLoading(false));
    }
  }, [artifact, fetchedContent, isLoading]);

  // Reset fetched content when artifact changes
  useEffect(() => {
    setFetchedContent(null);
  }, [artifact?.id]);

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

  const displayContent = artifact.content || fetchedContent || '';

  const icon = ARTIFACT_ICONS[artifact.type as ArtifactType] || '📄';
  // Show gate actions if gate is pending (simplified - no longer checking artifactIds)
  const showGateActions = gate && gate.status === 'pending' && onResolveGate;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 animate-modal-fade"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[900px] h-[85vh] max-h-[92vh] bg-bg-elevated border border-border rounded-2xl flex flex-col overflow-hidden shadow-modal animate-modal-slide"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-bg-secondary border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wide text-[#A78BFA] mb-0.5">
                {artifact.type.replace('_', ' ')}
              </span>
              <h2 className="text-base font-bold text-text-primary leading-tight">
                {artifact.title}
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
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#8B5CF6]/30 border-t-[#8B5CF6] rounded-full animate-spin" />
            </div>
          ) : (
            <div className="chat-markdown text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex-shrink-0 flex items-center justify-end px-5 py-3 bg-bg-secondary border-t border-border">
          <button
            className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </footer>

        {/* Review Actions - only show if this artifact is part of a pending gate */}
        {showGateActions && (
          <div className="flex-shrink-0 px-5 py-4 bg-bg-primary border-t border-orange/30">
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
                  onResolveGate(gate.id, 'approved', gateComment || undefined);
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
                  onResolveGate(gate.id, 'rejected', gateComment);
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
