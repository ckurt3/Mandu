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

// Format relative timestamp
function formatRelativeTime(date: Date | null): string {
  if (!date) return 'recently';

  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

interface ArtifactDropdownItemProps {
  artifact: Artifact;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
}

export function ArtifactDropdownItem({
  artifact,
  isSelected,
  isFocused,
  onClick,
}: ArtifactDropdownItemProps) {
  const icon = ARTIFACT_ICONS[artifact.type as ArtifactType] || '📄';
  const typeLabel = ARTIFACT_TYPE_LABELS[artifact.type as ArtifactType] || artifact.type;

  return (
    <button
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
        text-left transition-all duration-150
        ${isFocused
          ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/30'
          : 'hover:bg-[#8B5CF6]/10'
        }
        ${isSelected
          ? 'bg-[#8B5CF6]/20 border border-[#8B5CF6]/40'
          : 'border border-transparent'
        }
      `}
    >
      {/* Icon */}
      <span className="text-lg flex-shrink-0">
        {icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {artifact.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[#8B5CF6]/10 text-[#A78BFA] border border-[#8B5CF6]/20">
            {typeLabel}
          </span>
          <span className="text-[10px] text-text-muted">
            {formatRelativeTime(artifact.createdAt)}
          </span>
        </div>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <span className="text-[#8B5CF6] flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
    </button>
  );
}
