import { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Gate, Artifact } from '@shared/types';
import { useGates } from '../../contexts/GatesContext';
import { useArtifacts } from '../../contexts/ArtifactsContext';

// Status configuration for gates
const STATUS_CONFIG = {
  pending: {
    icon: '◐',
    label: 'Awaiting Review',
    iconBg: 'bg-orange/20',
    iconColor: 'text-orange',
    labelColor: 'text-orange',
    borderColor: 'border-orange/40',
    gradientFrom: 'from-orange/10',
    animate: true,
  },
  approved: {
    icon: '✓',
    label: 'Approved',
    iconBg: 'bg-green/15',
    iconColor: 'text-green',
    labelColor: 'text-green',
    borderColor: 'border-green/30',
    gradientFrom: 'from-green/5',
    animate: false,
  },
  rejected: {
    icon: '↻',
    label: 'Changes Requested',
    iconBg: 'bg-golden/15',
    iconColor: 'text-golden',
    labelColor: 'text-golden',
    borderColor: 'border-golden/40',
    gradientFrom: 'from-golden/5',
    animate: false,
  },
};

// Artifact type metadata
const ARTIFACT_META: Record<string, { icon: string; label: string }> = {
  spec: { icon: '📋', label: 'Specification' },
  design_doc: { icon: '📐', label: 'Design Document' },
  code_change: { icon: '🔧', label: 'Code Change' },
  test_report: { icon: '🧪', label: 'Test Report' },
  markdown: { icon: '📝', label: 'Document' },
  review: { icon: '🔍', label: 'Review' },
};

interface GateViewerProps {
  gate: Gate;
  artifacts: Artifact[];
  onResolve: (gateId: string, status: 'approved' | 'rejected', comment?: string) => void;
}

export function GateViewer({
  gate,
  artifacts,
  onResolve,
}: GateViewerProps) {
  const { selectGate } = useGates();
  const { selectArtifact } = useArtifacts();
  const [comment, setComment] = useState('');

  // Get related artifacts for this gate (same project)
  const relatedArtifacts = artifacts.filter(a => a.projectId === gate.projectId);

  const status = (gate.status as keyof typeof STATUS_CONFIG) || 'pending';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const isPending = gate.status === 'pending';

  const getArtifactMeta = (type: string) => ARTIFACT_META[type] || { icon: '📄', label: 'Artifact' };

  // Handle ESC key to close viewer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectGate(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectGate]);

  // Handle gate resolution
  const handleResolve = useCallback((resolveStatus: 'approved' | 'rejected') => {
    onResolve(gate.id, resolveStatus, comment || undefined);
    setComment('');
  }, [gate.id, comment, onResolve]);

  // Handle viewing an artifact
  const handleViewArtifact = useCallback((artifact: Artifact) => {
    selectArtifact(artifact);
    // Optionally close gate viewer when viewing artifact
    // selectGate(null);
  }, [selectArtifact]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-primary">
      {/* Header */}
      <div className={`flex-shrink-0 flex items-center gap-4 px-6 py-4 border-b ${config.borderColor} bg-gradient-to-r ${config.gradientFrom} to-transparent`}>
        {/* Status Icon */}
        <span className={`
          w-10 h-10 flex items-center justify-center text-lg font-bold rounded-xl
          ${config.iconBg} ${config.iconColor}
          ${config.animate ? 'animate-gate-viewer-pulse' : ''}
        `}>
          {config.icon}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`
              px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
              ${config.iconBg} ${config.labelColor} border border-current/20
            `}>
              {config.label}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-bg-hover text-text-muted border border-border">
              {gate.type}
            </span>
          </div>
          <h1 className="text-lg font-bold text-text-primary truncate">
            {gate.title}
          </h1>
        </div>

        {/* Close button */}
        <button
          onClick={() => selectGate(null)}
          className="
            w-9 h-9 flex items-center justify-center rounded-lg
            text-text-muted hover:text-text-primary hover:bg-bg-hover
            border border-transparent hover:border-border
            transition-all
          "
          aria-label="Close gate viewer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {/* Description */}
          {gate.description && (
            <div className="mb-6">
              <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-text-muted mb-3">
                <span className="text-orange">◈</span>
                Description
              </h2>
              <div className="chat-markdown prose prose-sm max-w-none bg-bg-secondary/50 rounded-xl p-4 border border-border">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {gate.description.replace(/\\n/g, '\n')}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Related Artifacts */}
          {relatedArtifacts.length > 0 && (
            <div className="mb-6">
              <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-text-muted mb-3">
                <span className="text-[#8B5CF6]">◈</span>
                Related Artifacts
              </h2>
              <div className="flex flex-col gap-2">
                {relatedArtifacts.map(artifact => {
                  const meta = getArtifactMeta(artifact.type);
                  return (
                    <button
                      key={artifact.id}
                      className="w-full flex items-center gap-3 p-3 bg-bg-secondary border border-border rounded-lg text-left transition-all hover:border-[#8B5CF6]/50 hover:bg-bg-hover group"
                      onClick={() => handleViewArtifact(artifact)}
                    >
                      <span className="text-xl">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#A78BFA]">{meta.label}</span>
                        <span className="block text-sm font-semibold text-text-primary truncate">{artifact.title}</span>
                      </div>
                      <span className="text-text-muted group-hover:text-[#8B5CF6] transition-colors">→</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resolution comment if available */}
          {gate.resolution && (
            <div className="mb-6">
              <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-text-muted mb-3">
                <span className="text-orange">💬</span>
                Review Feedback
              </h2>
              <div className="p-4 bg-bg-secondary rounded-xl border border-border border-l-[3px] border-l-orange">
                <p className="text-sm text-text-secondary leading-relaxed">{gate.resolution}</p>
              </div>
            </div>
          )}

          {/* Empty state for no description and no artifacts */}
          {!gate.description && relatedArtifacts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-4">🚧</span>
              <p className="text-sm text-text-muted">No additional details for this gate</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions (for pending gates) */}
      {isPending && (
        <div className="flex-shrink-0 px-6 py-4 bg-gradient-to-r from-orange/10 to-transparent border-t border-orange/30">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-orange mb-3">
              <span>⚡</span>
              <span>Review Required</span>
            </div>
            <div className="flex items-center gap-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add feedback (required for requesting changes)..."
                className="
                  flex-1 bg-bg-elevated border border-border rounded-lg px-4 py-2.5
                  text-sm text-text-primary placeholder:text-text-muted
                  focus:outline-none focus:border-orange/50 focus:ring-2 focus:ring-orange/10
                  transition-all resize-none
                "
                rows={1}
              />
              <button
                onClick={() => handleResolve('approved')}
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
                onClick={() => handleResolve('rejected')}
                disabled={!comment.trim()}
                className="
                  px-4 py-2.5 rounded-lg font-bold text-sm
                  bg-bg-elevated border border-border text-text-secondary
                  hover:bg-golden/10 hover:text-golden hover:border-golden/40
                  disabled:opacity-40 disabled:cursor-not-allowed
                  active:scale-[0.98] transition-all flex items-center gap-1.5
                "
                title={!comment.trim() ? 'Add feedback to request changes' : ''}
              >
                <span>↻</span>
                <span>Request Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pulsing animation style */}
      <style>{`
        @keyframes gate-viewer-pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
        .animate-gate-viewer-pulse {
          animation: gate-viewer-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
