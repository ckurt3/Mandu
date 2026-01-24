import type { Diff } from '@shared/types';

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

interface DiffDropdownItemProps {
  diff: Diff;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
}

export function DiffDropdownItem({
  diff,
  isSelected,
  isFocused,
  onClick,
}: DiffDropdownItemProps) {
  // Calculate stats
  const totalAdditions = diff.files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = diff.files.reduce((sum, f) => sum + f.deletions, 0);
  const fileCount = diff.files.length;

  return (
    <button
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
        text-left transition-all duration-150
        ${isFocused
          ? 'bg-[#10B981]/15 border-[#10B981]/30'
          : 'hover:bg-[#10B981]/10'
        }
        ${isSelected
          ? 'bg-[#10B981]/20 border border-[#10B981]/40'
          : 'border border-transparent'
        }
      `}
    >
      {/* Icon */}
      <span className="text-lg flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[#10B981]/15 text-[#10B981] font-bold">
        ⎇
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {diff.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {/* File count */}
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide bg-bg-hover text-text-muted border border-border">
            {fileCount} file{fileCount !== 1 ? 's' : ''}
          </span>
          {/* Stats */}
          <span className="text-[10px] font-mono flex items-center gap-1">
            <span className="text-green">+{totalAdditions}</span>
            <span className="text-red">−{totalDeletions}</span>
          </span>
          {/* Time */}
          <span className="text-[10px] text-text-muted">
            {formatRelativeTime(diff.createdAt)}
          </span>
        </div>
        {/* Refs if available */}
        {diff.baseRef && diff.headRef && (
          <div className="mt-1 text-[10px] text-text-muted font-mono truncate">
            {diff.baseRef} → {diff.headRef}
          </div>
        )}
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <span className="text-[#10B981] flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
    </button>
  );
}
