import type { Gate } from '@shared/types';

// Status configuration for gates
const STATUS_CONFIG = {
  pending: {
    icon: '◐',
    label: 'Awaiting Review',
    iconBg: 'bg-orange/20',
    iconColor: 'text-orange',
    labelColor: 'text-orange',
    animate: true,
  },
  approved: {
    icon: '✓',
    label: 'Approved',
    iconBg: 'bg-green/15',
    iconColor: 'text-green',
    labelColor: 'text-green',
    animate: false,
  },
  rejected: {
    icon: '↻',
    label: 'Changes Requested',
    iconBg: 'bg-golden/15',
    iconColor: 'text-golden',
    labelColor: 'text-golden',
    animate: false,
  },
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

interface GateDropdownItemProps {
  gate: Gate;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
}

export function GateDropdownItem({
  gate,
  isSelected,
  isFocused,
  onClick,
}: GateDropdownItemProps) {
  const status = (gate.status as keyof typeof STATUS_CONFIG) || 'pending';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <button
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
        text-left transition-all duration-150
        ${isFocused
          ? 'bg-orange/15 border-orange/30'
          : 'hover:bg-orange/10'
        }
        ${isSelected
          ? 'bg-orange/20 border border-orange/40'
          : 'border border-transparent'
        }
      `}
    >
      {/* Status Icon */}
      <span className={`
        w-[22px] h-[22px] flex items-center justify-center text-xs font-bold rounded-md flex-shrink-0
        ${config.iconBg} ${config.iconColor}
        ${config.animate ? 'animate-gate-status-pulse' : ''}
      `}>
        {config.icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {gate.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`
            px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide
            ${config.iconBg} ${config.labelColor} border border-current/20
          `}>
            {config.label}
          </span>
          <span className="text-[10px] text-text-muted">
            {formatRelativeTime(gate.requestedAt)}
          </span>
        </div>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <span className="text-orange flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}

      {/* Pulsing animation for pending status */}
      <style>{`
        @keyframes gate-status-pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
        .animate-gate-status-pulse {
          animation: gate-status-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </button>
  );
}
