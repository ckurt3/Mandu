import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Artifact, ArtifactType, Gate } from '@shared/types';
import { useArtifacts } from '../../contexts/ArtifactsContext';

// Icon mapping for artifact types
const ARTIFACT_ICONS: Record<ArtifactType, string> = {
  spec: '📋',
  design_doc: '🏗️',
  code_change: '💻',
  test_report: '🧪',
  review: '🔍',
  markdown: '📝',
};

// Friendly display names for artifact types
const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  spec: 'Specification',
  design_doc: 'Design Document',
  code_change: 'Code Changes',
  test_report: 'Test Report',
  review: 'Review',
  markdown: 'Document',
};

interface ArtifactViewerProps {
  artifact: Artifact;
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

export function ArtifactViewer({
  artifact,
  gate,
  gateComment = '',
  onGateCommentChange,
  onResolveGate,
}: ArtifactViewerProps) {
  const { selectArtifact } = useArtifacts();
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

  // Handle ESC key to close viewer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectArtifact(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectArtifact]);

  const displayContent = artifact.content || fetchedContent || '';
  const icon = ARTIFACT_ICONS[artifact.type as ArtifactType] || '📄';
  const typeLabel = ARTIFACT_TYPE_LABELS[artifact.type as ArtifactType] || artifact.type;
  const showGateActions = gate && gate.status === 'pending' && onResolveGate;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-primary">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-4 px-6 py-4 border-b border-border bg-gradient-to-r from-[#8B5CF6]/5 to-transparent">
        <span className="text-3xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/25">
              {typeLabel}
            </span>
            {artifact.filePath && (
              <span className="text-xs text-text-muted font-mono truncate">
                {artifact.filePath}
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold text-text-primary truncate">
            {artifact.title}
          </h1>
        </div>

        {/* Close button */}
        <button
          onClick={() => selectArtifact(null)}
          className="
            w-9 h-9 flex items-center justify-center rounded-lg
            text-text-muted hover:text-text-primary hover:bg-bg-hover
            border border-transparent hover:border-border
            transition-all
          "
          aria-label="Close artifact viewer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-[#8B5CF6]/30 border-t-[#8B5CF6] rounded-full animate-spin" />
                <span className="text-sm text-text-muted">Loading content...</span>
              </div>
            </div>
          ) : displayContent ? (
            <div className="chat-markdown prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-4">📄</span>
              <p className="text-sm text-text-muted">No content available</p>
            </div>
          )}
        </div>
      </div>

      {/* Gate Review Actions */}
      {showGateActions && (
        <div className="flex-shrink-0 px-6 py-4 bg-gradient-to-r from-[#8B5CF6]/10 to-transparent border-t border-[#8B5CF6]/30">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[#A78BFA] mb-3">
              <span>⚡</span>
              <span>Review Required</span>
              <span className="text-text-muted font-normal normal-case">— {gate.title}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={gateComment}
                onChange={(e) => onGateCommentChange?.(e.target.value)}
                placeholder="Add feedback (required for changes)..."
                className="
                  flex-1 bg-bg-elevated border border-border rounded-lg px-4 py-2.5
                  text-sm text-text-primary placeholder:text-text-muted
                  focus:outline-none focus:border-[#8B5CF6]/50 focus:ring-2 focus:ring-[#8B5CF6]/10
                  transition-all
                "
              />
              <button
                onClick={() => {
                  onResolveGate(gate.id, 'approved', gateComment || undefined);
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
        </div>
      )}
    </div>
  );
}
