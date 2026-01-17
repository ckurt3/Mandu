import { useArtifacts } from '../../contexts/ArtifactsContext';

interface ArtifactsDropdownButtonProps {
  count: number;
}

export function ArtifactsDropdownButton({ count }: ArtifactsDropdownButtonProps) {
  const { isDropdownOpen, toggleDropdown } = useArtifacts();

  return (
    <button
      onClick={toggleDropdown}
      aria-expanded={isDropdownOpen}
      aria-haspopup="listbox"
      className={`
        inline-flex items-center gap-2 px-3 h-[34px] rounded-lg border
        transition-all duration-200 hover:scale-[1.02]
        ${isDropdownOpen
          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 shadow-[0_0_12px_rgba(139,92,246,0.15)]'
          : 'bg-[#8B5CF6]/10 border-[#8B5CF6]/30 hover:border-[#8B5CF6]/50'
        }
      `}
    >
      {/* Dropdown icon */}
      <span className="text-base leading-none">📦</span>

      {/* Label */}
      <span className="text-[11px] font-bold text-[#A78BFA] leading-none">
        Artifacts
      </span>

      {/* Count badge */}
      <span className={`
        min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none
        flex items-center justify-center transition-colors
        ${isDropdownOpen
          ? 'bg-[#8B5CF6]/30 text-[#A78BFA]'
          : 'bg-[#8B5CF6]/20 text-[#A78BFA]/80'
        }
      `}>
        {count}
      </span>

      {/* Chevron indicator */}
      <svg
        className={`w-3.5 h-3.5 text-[#A78BFA] transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}
