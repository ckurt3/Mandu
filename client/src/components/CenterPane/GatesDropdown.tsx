import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Gate } from '@shared/types';
import { GateDropdownItem } from './GateDropdownItem';
import { useGates, type GateFilterType } from '../../contexts/GatesContext';

interface FilterConfig {
  key: GateFilterType;
  label: string;
  icon: string;
}

const FILTERS: FilterConfig[] = [
  { key: 'all', label: 'All', icon: '📋' },
  { key: 'pending', label: 'Pending', icon: '◐' },
  { key: 'approved', label: 'Approved', icon: '✓' },
  { key: 'rejected', label: 'Changes', icon: '↻' },
];

interface GatesDropdownProps {
  gates: Gate[];
  onClose: () => void;
}

export function GatesDropdown({ gates, onClose }: GatesDropdownProps) {
  const { selectedGate, selectGate, filterType, setFilterType } = useGates();
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter gates
  const filteredGates = useMemo(() => {
    const filtered = filterType === 'all'
      ? gates
      : gates.filter(g => g.status === filterType);

    // Sort by requestedAt descending (newest first), pending gates first
    return [...filtered].sort((a, b) => {
      // Pending gates always first
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;

      const aTime = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const bTime = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [gates, filterType]);

  // Count per status for badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: gates.length };
    for (const gate of gates) {
      const status = gate.status || 'pending';
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }, [gates]);

  // Handle item selection
  const handleSelect = useCallback((gate: Gate) => {
    selectGate(gate);
    // Auto-close is handled by context
  }, [selectGate]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev < filteredGates.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev > 0 ? prev - 1 : filteredGates.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredGates.length) {
          handleSelect(filteredGates[focusedIndex]);
        }
        break;
      case 'Tab':
        // Allow tab to close dropdown and move focus
        onClose();
        break;
    }
  }, [filteredGates, focusedIndex, handleSelect, onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        // Check if click was on the dropdown button (parent element handles this)
        const target = e.target as HTMLElement;
        if (!target.closest('[aria-haspopup="listbox"]')) {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, onClose]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  // Reset focus when filter changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [filterType]);

  return (
    <div
      ref={dropdownRef}
      role="listbox"
      aria-label="Select gate"
      className="
        absolute top-full right-0 mt-2 z-50
        w-[320px] max-h-[400px]
        bg-bg-elevated border border-orange/30 rounded-xl
        shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,140,66,0.1)]
        animate-dropdown-in overflow-hidden
        flex flex-col
      "
    >
      {/* Filter tabs */}
      <div className="flex-shrink-0 p-2 border-b border-border bg-bg-secondary/50">
        <div className="flex items-center gap-1 overflow-x-auto">
          {FILTERS.map(({ key, label, icon }) => {
            const count = statusCounts[key] || 0;
            const isActive = filterType === key;

            // Don't show empty filter options (except 'all')
            if (key !== 'all' && count === 0) return null;

            return (
              <button
                key={key}
                onClick={() => setFilterType(key)}
                className={`
                  flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold
                  transition-all flex-shrink-0
                  ${isActive
                    ? 'bg-orange/20 text-orange'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                  }
                `}
              >
                <span>{icon}</span>
                <span>{label}</span>
                <span className={`
                  min-w-[14px] h-[14px] px-0.5 rounded text-[9px] font-bold
                  flex items-center justify-center
                  ${isActive ? 'bg-orange/20' : 'bg-bg-hover'}
                `}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Gates list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2">
        {filteredGates.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-3xl mb-2 block">🚧</span>
            <p className="text-sm text-text-muted">
              {filterType === 'all'
                ? 'No gates yet'
                : `No ${filterType} gates`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredGates.map((gate, index) => (
              <GateDropdownItem
                key={gate.id}
                gate={gate}
                isSelected={selectedGate?.id === gate.id}
                isFocused={focusedIndex === index}
                onClick={() => handleSelect(gate)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-border bg-bg-secondary/30">
        <div className="flex items-center justify-center gap-3 text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-hover border border-border font-mono">↑↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-hover border border-border font-mono">↵</kbd>
            <span>Select</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-hover border border-border font-mono">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>

      <style>{`
        @keyframes dropdownIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-dropdown-in {
          animation: dropdownIn 0.15s ease-out;
        }
      `}</style>
    </div>
  );
}
