import { useDiffs } from '../../contexts/DiffsContext';

export function DiffsDropdownButton() {
  const { isDropdownOpen, toggleDropdown, diffs, isLoading, refreshDiffs } = useDiffs();
  const count = diffs.length;

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refreshDiffs();
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleDropdown}
        aria-expanded={isDropdownOpen}
        aria-haspopup="listbox"
        className={`
          inline-flex items-center gap-2 px-3 h-[34px] rounded-lg border
          transition-all duration-200 hover:scale-[1.02]
          ${isDropdownOpen
            ? 'bg-[#10B981]/20 border-[#10B981]/50 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
            : 'bg-[#10B981]/10 border-[#10B981]/30 hover:border-[#10B981]/50'
          }
        `}
      >
        {/* Dropdown icon */}
        <span className="text-base leading-none">⎇</span>

        {/* Label */}
        <span className="text-[11px] font-bold text-[#10B981] leading-none">
          Diffs
        </span>

        {/* Count badge or loading indicator */}
        <span className={`
          min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none
          flex items-center justify-center transition-colors
          ${isDropdownOpen
            ? 'bg-[#10B981]/30 text-[#10B981]'
            : 'bg-[#10B981]/20 text-[#10B981]/80'
          }
        `}>
          {isLoading ? (
            <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            count
          )}
        </span>

        {/* Chevron indicator */}
        <svg
          className={`w-3.5 h-3.5 text-[#10B981] transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        disabled={isLoading}
        className={`
          w-[34px] h-[34px] rounded-lg border flex items-center justify-center
          transition-all duration-200 hover:scale-[1.02]
          bg-[#10B981]/10 border-[#10B981]/30 hover:border-[#10B981]/50
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        title="Refresh diffs"
      >
        <svg
          className={`w-3.5 h-3.5 text-[#10B981] ${isLoading ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
}
