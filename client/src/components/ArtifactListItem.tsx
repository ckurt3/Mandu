import type { Artifact, ArtifactType } from '@shared/types';

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
  spec: 'Spec',
  design_doc: 'Design',
  code_change: 'Code',
  test_report: 'Tests',
  review: 'Review',
  markdown: 'Doc',
};

interface ArtifactListItemProps {
  artifact: Artifact;
  onClick: () => void;
}

// Format relative timestamp
function formatRelativeTime(date: Date | null): string {
  if (!date) return 'recently';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ArtifactListItem({ artifact, onClick }: ArtifactListItemProps) {
  const icon = ARTIFACT_ICONS[artifact.type as ArtifactType] || '📄';
  const typeLabel = ARTIFACT_TYPE_LABELS[artifact.type as ArtifactType] || artifact.type;

  return (
    <button
      onClick={onClick}
      className="
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
        bg-bg-primary border border-border
        hover:border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/5
        transition-all text-left group
      "
    >
      {/* Icon */}
      <span className="text-xl flex-shrink-0 group-hover:scale-110 transition-transform">
        {icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary truncate">
            {artifact.title}
          </span>
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[#8B5CF6]/10 text-[#A78BFA] border border-[#8B5CF6]/20">
            {typeLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
          <span>{formatRelativeTime(artifact.createdAt)}</span>
        </div>
      </div>

      {/* Arrow */}
      <span className="text-[#A78BFA] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0">
        →
      </span>
    </button>
  );
}
