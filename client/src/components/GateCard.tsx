import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Gate, Artifact } from '../types';

interface GateCardProps {
  gate: Gate;
  artifacts: Artifact[];
  onResolve: (gateId: string, status: 'approved' | 'changes_requested', comment?: string) => void;
}

// Artifact type icons and labels
const ARTIFACT_META: Record<string, { icon: string; label: string }> = {
  spec: { icon: '📋', label: 'Specification' },
  design_doc: { icon: '📐', label: 'Design Document' },
  code_change: { icon: '🔧', label: 'Code Change' },
  test_report: { icon: '🧪', label: 'Test Report' },
  markdown: { icon: '📝', label: 'Document' },
};

export function GateCard({ gate, artifacts, onResolve }: GateCardProps) {
  const [comment, setComment] = useState('');
  const [modalArtifact, setModalArtifact] = useState<Artifact | null>(null);

  const relatedArtifacts = artifacts.filter(a => gate.artifactIds.includes(a._id));

  // Handle escape key to close modal
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
        return { label: 'Awaiting Review', className: 'pending', icon: '◐' };
      case 'approved':
        return { label: 'Approved', className: 'approved', icon: '✓' };
      case 'changes_requested':
        return { label: 'Changes Requested', className: 'changes', icon: '↻' };
    }
  };

  const statusConfig = getStatusConfig();
  const artifactMeta = (type: string) => ARTIFACT_META[type] || { icon: '📄', label: 'Artifact' };

  return (
    <>
      <article className={`gate-card-v2 ${gate.status}`}>
        {/* Header */}
        <header className="gate-v2-header">
          <div className="gate-v2-status">
            <span className={`gate-v2-status-icon ${statusConfig.className}`}>
              {statusConfig.icon}
            </span>
            <span className={`gate-v2-status-label ${statusConfig.className}`}>
              {statusConfig.label}
            </span>
          </div>
        </header>

        {/* Title & Description */}
        <div className="gate-v2-content">
          <h3 className="gate-v2-title">{gate.title}</h3>
          <div className="gate-v2-description">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {gate.description}
            </ReactMarkdown>
          </div>
          <div className="gate-v2-meta">
            <span className="gate-v2-requester">
              <span className="meta-label">Requested by</span>
              <span className="meta-value">{gate.requestedBy}</span>
            </span>
          </div>
        </div>

        {/* Artifacts */}
        {relatedArtifacts.length > 0 && (
          <div className="gate-v2-artifacts">
            <h4 className="gate-v2-section-title">
              <span className="section-icon">◈</span>
              Artifacts to Review
            </h4>
            <div className="gate-v2-artifact-grid">
              {relatedArtifacts.map(artifact => {
                const meta = artifactMeta(artifact.type);
                return (
                  <button
                    key={artifact._id}
                    className="gate-v2-artifact-btn"
                    onClick={() => setModalArtifact(artifact)}
                  >
                    <span className="artifact-icon">{meta.icon}</span>
                    <div className="artifact-info">
                      <span className="artifact-type-label">{meta.label}</span>
                      <span className="artifact-name">{artifact.name}</span>
                    </div>
                    <span className="artifact-open-icon">↗</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        {gate.status === 'pending' && (
          <div className="gate-v2-actions">
            <div className="gate-v2-comment-wrapper">
              <textarea
                className="gate-v2-comment"
                placeholder="Add feedback or notes (optional)..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
              />
            </div>
            <div className="gate-v2-buttons">
              <button
                className="gate-v2-btn approve"
                onClick={() => handleAction('approved')}
              >
                <span className="btn-icon">✓</span>
                <span className="btn-label">Approve</span>
              </button>
              <button
                className="gate-v2-btn changes"
                onClick={() => handleAction('changes_requested')}
                disabled={!comment.trim()}
              >
                <span className="btn-label">Request Changes</span>
              </button>
            </div>
          </div>
        )}

        {/* Reviewer Comment */}
        {gate.reviewerComment && (
          <div className="gate-v2-reviewer-comment">
            <div className="reviewer-comment-header">
              <span className="comment-icon">💬</span>
              <span>Review Feedback</span>
            </div>
            <p>{gate.reviewerComment}</p>
          </div>
        )}
      </article>

      {/* Artifact Modal with Review Actions */}
      {modalArtifact && (
        <div
          className="artifact-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalArtifact(null);
          }}
        >
          <div className="artifact-modal">
            <header className="artifact-modal-header">
              <div className="artifact-modal-title-group">
                <span className="artifact-modal-icon">
                  {artifactMeta(modalArtifact.type).icon}
                </span>
                <div>
                  <span className="artifact-modal-type">
                    {artifactMeta(modalArtifact.type).label}
                  </span>
                  <h2 className="artifact-modal-title">{modalArtifact.name}</h2>
                </div>
              </div>
              <button
                className="artifact-modal-close"
                onClick={() => setModalArtifact(null)}
                aria-label="Close"
              >
                <span>✕</span>
              </button>
            </header>
            <div className="artifact-modal-content">
              <div className="artifact-modal-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {modalArtifact.content}
                </ReactMarkdown>
              </div>
            </div>
            <footer className="artifact-modal-footer">
              <span className="artifact-modal-meta">
                Created by {modalArtifact.createdBy}
              </span>
              {gate.status !== 'pending' ? (
                <button
                  className="artifact-modal-done"
                  onClick={() => setModalArtifact(null)}
                >
                  Close
                </button>
              ) : (
                <button
                  className="artifact-modal-done secondary"
                  onClick={() => setModalArtifact(null)}
                >
                  Review Later
                </button>
              )}
            </footer>

            {/* Review Actions - Only show for pending gates */}
            {gate.status === 'pending' && (
              <div className="artifact-modal-actions">
                <div className="modal-actions-header">
                  <span className="modal-actions-icon">⚡</span>
                  <span>Submit Review</span>
                </div>
                <textarea
                  className="modal-comment"
                  placeholder="Add feedback or notes (optional)..."
                  value={comment}
                  onChange={(e) => {
                    setComment(e.target.value);
                    // Auto-expand textarea
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  rows={2}
                />
                <div className="modal-buttons">
                  <button
                    className="modal-btn approve"
                    onClick={() => {
                      handleAction('approved');
                      setModalArtifact(null);
                    }}
                  >
                    <span className="btn-icon">✓</span>
                    <span>Approve</span>
                  </button>
                  <button
                    className="modal-btn changes"
                    onClick={() => {
                      handleAction('changes_requested');
                      setModalArtifact(null);
                    }}
                    disabled={!comment.trim()}
                  >
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
