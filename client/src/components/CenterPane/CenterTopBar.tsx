import { ArtifactsDropdownButton } from './ArtifactsDropdownButton';
import { ArtifactsDropdown } from './ArtifactsDropdown';
import { useArtifacts } from '../../contexts/ArtifactsContext';
import type { Artifact } from '@shared/types';

interface CenterTopBarProps {
  artifacts: Artifact[];
  projectName?: string;
}

export function CenterTopBar({ artifacts, projectName }: CenterTopBarProps) {
  const { isDropdownOpen, selectedArtifact, closeDropdown, selectArtifact } = useArtifacts();

  return (
    <div className="relative h-[52px] px-4 flex items-center justify-between border-b border-border bg-gradient-to-r from-violet-500/5 to-transparent flex-shrink-0">
      {/* Left side - Title or breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        {selectedArtifact ? (
          <>
            <button
              onClick={() => selectArtifact(null)}
              className="text-xs text-text-muted hover:text-[#A78BFA] transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <span className="text-text-muted/50">/</span>
            <span className="text-sm font-semibold text-[#A78BFA] truncate">
              {selectedArtifact.title}
            </span>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-lg">📦</span>
            <span className="text-sm font-semibold text-text-primary">
              {projectName ? `${projectName} Artifacts` : 'Project Artifacts'}
            </span>
          </div>
        )}
      </div>

      {/* Right side - Artifacts dropdown button */}
      <div className="flex items-center gap-2">
        <ArtifactsDropdownButton count={artifacts.length} />
      </div>

      {/* Dropdown menu */}
      {isDropdownOpen && (
        <ArtifactsDropdown
          artifacts={artifacts}
          onClose={closeDropdown}
        />
      )}
    </div>
  );
}
