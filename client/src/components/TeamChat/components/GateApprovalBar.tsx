import type { Gate, Artifact } from '@shared/types';

interface GateApprovalBarProps {
  gate: Gate;
  artifacts: Artifact[];
  comment: string;
  onCommentChange: (value: string) => void;
  onResolve: (gateId: string, status: 'approved' | 'rejected', comment?: string) => void;
  onViewArtifact: (artifact: Artifact) => void;
}

export function GateApprovalBar({
  gate,
  artifacts,
  comment,
  onCommentChange,
  onResolve,
  onViewArtifact,
}: GateApprovalBarProps) {
  return (
    <div className="flex-shrink-0 border-t border-orange/30 bg-bg-secondary/80 backdrop-blur-sm p-3">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        {/* Artifact Button(s) */}
        {artifacts.length > 0 && (
          <div className="flex gap-2">
            {artifacts.map(artifact => (
              <button
                key={artifact.id}
                onClick={() => onViewArtifact(artifact)}
                className="
                  group flex items-center gap-2 h-[46px] px-3 rounded-lg
                  bg-[#8B5CF6]/10 border border-[#8B5CF6]/30
                  hover:bg-[#8B5CF6]/20 hover:border-[#8B5CF6]/50
                  transition-all text-left
                "
              >
                <span className="text-base group-hover:scale-110 transition-transform">📋</span>
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-[#A78BFA] leading-tight">
                    {artifact.type.replace('_', ' ')}
                  </span>
                  <span className="block text-xs font-semibold text-text-primary truncate max-w-[120px] leading-tight">
                    {artifact.title}
                  </span>
                </div>
                <span className="text-[#A78BFA] group-hover:translate-x-0.5 transition-transform">→</span>
              </button>
            ))}
          </div>
        )}

        {/* Feedback Input */}
        <input
          type="text"
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Feedback (required for changes)..."
          className="
            flex-1 h-[46px] bg-bg-primary border border-border rounded-lg px-3
            text-sm text-text-primary placeholder:text-text-muted
            focus:outline-none focus:border-orange/50 focus:ring-1 focus:ring-orange/10
            transition-all
          "
        />

        {/* Action Buttons */}
        <button
          onClick={() => {
            onResolve(gate.id, 'approved', comment || undefined);
          }}
          className="
            h-[46px] px-4 rounded-lg font-bold text-sm
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
            onResolve(gate.id, 'rejected', comment);
          }}
          disabled={!comment.trim()}
          className="
            h-[46px] px-4 rounded-lg font-bold text-sm
            bg-bg-elevated border border-border text-text-secondary
            hover:bg-golden/10 hover:text-golden hover:border-golden/40
            disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-[0.98] transition-all flex items-center gap-1.5
          "
          title={!comment.trim() ? 'Add feedback to request changes' : ''}
        >
          <span>↻</span>
          <span>Changes</span>
        </button>
      </div>
    </div>
  );
}
