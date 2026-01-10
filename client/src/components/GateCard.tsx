import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Gate, Artifact } from '../types';

interface GateCardProps {
  gate: Gate;
  artifacts: Artifact[];
  onResolve: (gateId: string, status: 'approved' | 'changes_requested', comment?: string) => void;
}

const ARTIFACT_META: Record<string, { icon: string; label: string }> = {
  spec: { icon: '📋', label: 'Specification' },
  design_doc: { icon: '📐', label: 'Design Document' },
  code_change: { icon: '🔧', label: 'Code Change' },
  test_report: { icon: '🧪', label: 'Test Report' },
  markdown: { icon: '📝', label: 'Document' },
};

const statusStyles = {
  pending: {
    border: 'border-orange/40',
    iconBg: 'bg-orange-glow',
    iconColor: 'text-orange',
    labelColor: 'text-orange',
    animate: 'animate-pulse-status',
  },
  approved: {
    border: 'border-green/30 opacity-65',
    iconBg: 'bg-green-dim',
    iconColor: 'text-green',
    labelColor: 'text-green',
    animate: '',
  },
  changes_requested: {
    border: 'border-golden/40 opacity-75',
    iconBg: 'bg-golden/15',
    iconColor: 'text-golden',
    labelColor: 'text-golden',
    animate: '',
  },
};

export function GateCard({ gate, artifacts, onResolve }: GateCardProps) {
  const [comment, setComment] = useState('');
  const [modalArtifact, setModalArtifact] = useState<Artifact | null>(null);

  const relatedArtifacts = artifacts.filter(a => gate.artifactIds.includes(a._id));

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalArtifact) {
        setModalArtifact(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [modalArtifact]);

  const handleAction = useCallback((status: 'approved' | 'changes_requested') => {
    onResolve(gate._id, status, comment || undefined);
    setComment('');
  }, [gate._id, comment, onResolve]);

  const getStatusConfig = () => {
    switch (gate.status) {
      case 'pending':
        return { label: 'Awaiting Review', icon: '◐' };
      case 'approved':
        return { label: 'Approved', icon: '✓' };
      case 'changes_requested':
        return { label: 'Changes Requested', icon: '↻' };
    }
  };

  const statusConfig = getStatusConfig();
  const styles = statusStyles[gate.status];
  const artifactMeta = (type: string) => ARTIFACT_META[type] || { icon: '📄', label: 'Artifact' };

  return (
    <>
      <article className={`bg-bg-elevated border rounded-xl animate-slide-up ${styles.border}`}>
        {/* Header */}
        <header className="px-4 py-3 bg-gradient-to-br from-orange/5 to-transparent border-b border-border">
          <div className="flex items-center gap-2">
            <span className={`w-[22px] h-[22px] flex items-center justify-center text-xs font-bold rounded-md ${styles.iconBg} ${styles.iconColor} ${styles.animate}`}>
              {statusConfig.icon}
            </span>
            <span className={`text-[11px] font-bold uppercase tracking-wide ${styles.labelColor}`}>
              {statusConfig.label}
            </span>
          </div>
        </header>

        {/* Title & Description */}
        <div className="p-4">
          <h3 className="text-[17px] font-extrabold text-text-primary mb-3 leading-tight">{gate.title}</h3>
          <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {gate.description}
            </ReactMarkdown>
          </div>
          <div className="mt-4 pt-3 border-t border-border/50">
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Requested by</span>
              <span className="text-xs font-semibold text-orange">{gate.requestedBy}</span>
            </span>
          </div>
        </div>

        {/* Artifacts */}
        {relatedArtifacts.length > 0 && (
          <div className="px-4 pb-4">
            <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-text-muted mb-3">
              <span className="text-orange">◈</span>
              Artifacts to Review
            </h4>
            <div className="flex flex-col gap-2">
              {relatedArtifacts.map(artifact => {
                const meta = artifactMeta(artifact.type);
                return (
                  <button
                    key={artifact._id}
                    className="w-full flex items-center gap-3 p-3 bg-bg-primary border border-border rounded-lg text-left transition-all hover:border-orange/50 hover:bg-bg-hover group"
                    onClick={() => setModalArtifact(artifact)}
                  >
                    <span className="text-xl">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-orange">{meta.label}</span>
                      <span className="block text-sm font-semibold text-text-primary truncate">{artifact.name}</span>
                    </div>
                    <span className="text-text-muted group-hover:text-orange transition-colors">↗</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        {gate.status === 'pending' && (
          <div className="p-4 pt-0">
            <textarea
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-orange focus:ring-2 focus:ring-orange/20 resize-none transition-all mb-3"
              placeholder="Add feedback or notes (optional)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
            <div className="flex flex-col gap-2">
              <button
                className="flex items-center justify-center gap-2 py-3 px-5 rounded-lg font-bold text-sm bg-green/15 text-green hover:bg-green/25 transition-all"
                onClick={() => handleAction('approved')}
              >
                <span>✓</span>
                <span>Approve</span>
              </button>
              <button
                className="flex items-center justify-center gap-2 py-3 px-5 rounded-lg font-bold text-sm bg-bg-hover border border-border text-text-secondary hover:bg-golden/15 hover:text-golden hover:border-golden/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() => handleAction('changes_requested')}
                disabled={!comment.trim()}
                title={!comment.trim() ? 'Add feedback to request changes' : ''}
              >
                <span>↻</span>
                <span>Request Changes</span>
              </button>
            </div>
          </div>
        )}

        {/* Reviewer Comment */}
        {gate.reviewerComment && (
          <div className="mx-4 mb-4 p-3 bg-bg-primary rounded-lg border border-border border-l-[3px] border-l-orange">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2">
              <span className="text-sm">💬</span>
              <span>Review Feedback</span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{gate.reviewerComment}</p>
          </div>
        )}
      </article>

      {/* Artifact Modal */}
      {modalArtifact && (
        <div
          className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 animate-modal-fade"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalArtifact(null);
          }}
        >
          <div className="w-full max-w-[900px] max-h-[92vh] bg-bg-elevated border border-border rounded-2xl flex flex-col overflow-hidden shadow-modal animate-modal-slide">
            <header className="flex items-center justify-between px-5 py-3 bg-bg-secondary border-b border-border">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{artifactMeta(modalArtifact.type).icon}</span>
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-orange mb-0.5">
                    {artifactMeta(modalArtifact.type).label}
                  </span>
                  <h2 className="text-base font-bold text-text-primary leading-tight">{modalArtifact.name}</h2>
                </div>
              </div>
              <button
                className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
                onClick={() => setModalArtifact(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {modalArtifact.content}
                </ReactMarkdown>
              </div>
            </div>

            <footer className="flex items-center justify-between px-5 py-3 bg-bg-secondary border-t border-border">
              <span className="text-xs text-text-muted">Created by {modalArtifact.createdBy}</span>
              <button
                className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                onClick={() => setModalArtifact(null)}
              >
                {gate.status === 'pending' ? 'Review Later' : 'Close'}
              </button>
            </footer>

            {/* Review Actions */}
            {gate.status === 'pending' && (
              <div className="px-5 py-4 bg-bg-primary border-t border-border">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-text-muted mb-3">
                  <span className="text-xs">⚡</span>
                  <span>Submit Review</span>
                </div>
                <textarea
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-orange focus:ring-2 focus:ring-orange/20 resize-y min-h-[50px] max-h-[200px] transition-all mb-3"
                  placeholder="Add feedback or notes (optional)..."
                  value={comment}
                  onChange={(e) => {
                    setComment(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-sm bg-green/15 text-green hover:bg-green/25 transition-all"
                    onClick={() => {
                      handleAction('approved');
                      setModalArtifact(null);
                    }}
                  >
                    <span>✓</span>
                    <span>Approve</span>
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-sm bg-bg-hover border border-border text-text-secondary hover:bg-golden/15 hover:text-golden hover:border-golden/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={() => {
                      handleAction('changes_requested');
                      setModalArtifact(null);
                    }}
                    disabled={!comment.trim()}
                    title={!comment.trim() ? 'Add feedback to request changes' : ''}
                  >
                    <span>↻</span>
                    <span>Request Changes</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
