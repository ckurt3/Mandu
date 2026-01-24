import { ArtifactsDropdownButton } from './ArtifactsDropdownButton';
import { ArtifactsDropdown } from './ArtifactsDropdown';
import { GatesDropdownButton } from './GatesDropdownButton';
import { GatesDropdown } from './GatesDropdown';
import { DiffsDropdownButton } from './DiffsDropdownButton';
import { DiffsDropdown } from './DiffsDropdown';
import { useArtifacts } from '../../contexts/ArtifactsContext';
import { useGates } from '../../contexts/GatesContext';
import { useDiffs } from '../../contexts/DiffsContext';
import type { Artifact, Gate } from '@shared/types';

interface CenterTopBarProps {
  artifacts: Artifact[];
  gates: Gate[];
  diffs: import('@shared/types').Diff[]; // From context now, but keeping for dropdown
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  isRightPaneOpen: boolean;
  onToggleRightPane: () => void;
}

export function CenterTopBar({
  artifacts,
  gates,
  diffs,
  isMenuOpen,
  onToggleMenu,
  isRightPaneOpen,
  onToggleRightPane,
}: CenterTopBarProps) {
  const { isDropdownOpen: isArtifactsDropdownOpen, selectedArtifact, closeDropdown: closeArtifactsDropdown, selectArtifact } = useArtifacts();
  const { isDropdownOpen: isGatesDropdownOpen, selectedGate, closeDropdown: closeGatesDropdown, selectGate } = useGates();
  const { isDropdownOpen: isDiffsDropdownOpen, selectedDiff, closeDropdown: closeDiffsDropdown, selectDiff, diffs: contextDiffs } = useDiffs();

  return (
    <div className="relative h-[52px] px-3 flex items-center justify-between border-b border-border flex-shrink-0" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,140,66,0.05) 50%, transparent 100%)' }}>
      {/* Left side - Menu toggle or back button */}
      <div className="flex items-center gap-2 min-w-[120px]">
        {!isMenuOpen && (
          <button
            className="inline-flex items-center gap-2 px-3 h-[34px] rounded-lg border-2 border-orange/40 bg-orange/10 text-orange hover:bg-orange/20 hover:border-orange/60 transition-all"
            onClick={onToggleMenu}
            aria-label="Open sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="text-xs font-bold">Mandu</span>
          </button>
        )}
        {/* Back button for artifact viewer */}
        {selectedArtifact && (
          <button
            onClick={() => selectArtifact(null)}
            className="text-xs text-text-muted hover:text-[#A78BFA] transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}
        {/* Back button for gate viewer */}
        {selectedGate && !selectedArtifact && (
          <button
            onClick={() => selectGate(null)}
            className="text-xs text-text-muted hover:text-orange transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}
        {/* Back button for diff viewer */}
        {selectedDiff && !selectedArtifact && !selectedGate && (
          <button
            onClick={() => selectDiff(null)}
            className="text-xs text-text-muted hover:text-[#10B981] transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}
      </div>

      {/* Center - Artifacts, Gates, and Diffs dropdown buttons */}
      <div className="flex items-center gap-2 relative">
        {selectedArtifact ? (
          <span className="text-sm font-semibold text-[#A78BFA] truncate max-w-[200px]">
            {selectedArtifact.title}
          </span>
        ) : selectedGate ? (
          <span className="text-sm font-semibold text-orange truncate max-w-[200px]">
            {selectedGate.title}
          </span>
        ) : selectedDiff ? (
          <span className="text-sm font-semibold text-[#10B981] truncate max-w-[200px]">
            {selectedDiff.title}
          </span>
        ) : (
          <>
            <ArtifactsDropdownButton count={artifacts.length} />
            <GatesDropdownButton gates={gates} />
            <DiffsDropdownButton />
          </>
        )}

        {/* Artifacts dropdown menu */}
        {isArtifactsDropdownOpen && (
          <ArtifactsDropdown
            artifacts={artifacts}
            onClose={closeArtifactsDropdown}
          />
        )}

        {/* Gates dropdown menu */}
        {isGatesDropdownOpen && (
          <GatesDropdown
            gates={gates}
            onClose={closeGatesDropdown}
          />
        )}

        {/* Diffs dropdown menu */}
        {isDiffsDropdownOpen && (
          <DiffsDropdown
            diffs={contextDiffs}
            onClose={closeDiffsDropdown}
          />
        )}
      </div>

      {/* Right side - Chat toggle */}
      <div className="flex items-center gap-2 min-w-[120px] justify-end">
        {!isRightPaneOpen && (
          <button
            className="inline-flex items-center gap-2 px-3 h-[34px] rounded-lg border-2 border-orange/40 bg-orange/10 text-orange hover:bg-orange/20 hover:border-orange/60 transition-all"
            onClick={onToggleRightPane}
            aria-label="Open chat panel"
          >
            <span className="text-xs font-bold">Chat</span>
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
