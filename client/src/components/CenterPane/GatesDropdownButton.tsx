import { useGates } from '../../contexts/GatesContext';
import type { Gate } from '@shared/types';

interface GatesDropdownButtonProps {
  gates: Gate[];
}

export function GatesDropdownButton({ gates }: GatesDropdownButtonProps) {
  const { isDropdownOpen, toggleDropdown } = useGates();

  const pendingCount = gates.filter(g => g.status === 'pending').length;
  const hasPending = pendingCount > 0;

  return (
    <button
      onClick={toggleDropdown}
      aria-expanded={isDropdownOpen}
      aria-haspopup="listbox"
      className={`
        inline-flex items-center gap-2 px-3 h-[34px] rounded-lg border
        transition-all duration-200 hover:scale-[1.02]
        ${isDropdownOpen
          ? 'bg-orange/20 border-orange/50 shadow-[0_0_12px_rgba(255,140,66,0.15)]'
          : 'bg-orange/10 border-orange/30 hover:border-orange/50'
        }
      `}
    >
      {/* Gate icon with optional pulsing indicator */}
      <span className="relative text-base leading-none">
        🚧
        {hasPending && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange animate-gate-pulse" />
        )}
      </span>

      {/* Label */}
      <span className="text-[11px] font-bold text-orange leading-none">
        Gates
      </span>

      {/* Count badge */}
      <span className={`
        min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none
        flex items-center justify-center transition-colors
        ${hasPending
          ? 'bg-orange/30 text-orange'
          : isDropdownOpen
            ? 'bg-orange/30 text-orange'
            : 'bg-orange/20 text-orange/80'
        }
      `}>
        {gates.length}
      </span>

      {/* Chevron indicator */}
      <svg
        className={`w-3.5 h-3.5 text-orange transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>

      {/* Pulsing animation style */}
      <style>{`
        @keyframes gate-pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.2);
          }
        }
        .animate-gate-pulse {
          animation: gate-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </button>
  );
}
