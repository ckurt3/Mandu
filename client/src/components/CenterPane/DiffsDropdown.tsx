import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Diff, DiffFile } from '@shared/types';
import { DiffDropdownItem } from './DiffDropdownItem';
import { useDiffs } from '../../contexts/DiffsContext';

type FilterType = 'all' | DiffFile['status'];

interface FilterConfig {
  key: FilterType;
  label: string;
  icon: string;
}

const FILTERS: FilterConfig[] = [
  { key: 'all', label: 'All', icon: '⎇' },
  { key: 'added', label: 'Added', icon: '+' },
  { key: 'modified', label: 'Modified', icon: '~' },
  { key: 'deleted', label: 'Deleted', icon: '−' },
];

interface DiffsDropdownProps {
  diffs: Diff[];
  onClose: () => void;
}

export function DiffsDropdown({ diffs, onClose }: DiffsDropdownProps) {
  const { selectedDiff, selectDiff, isLoading, error } = useDiffs();
  const [filter, setFilter] = useState<FilterType>('all');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter diffs based on whether they contain files of a certain status
  const filteredDiffs = useMemo(() => {
    const filtered = filter === 'all'
      ? diffs
      : diffs.filter(d => d.files.some(f => f.status === filter));

    // Sort by createdAt descending (newest first)
    return [...filtered].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [diffs, filter]);

  // Count files per status across all diffs
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: diffs.length };
    for (const diff of diffs) {
      for (const file of diff.files) {
        // Count diffs that have at least one file of this status
        if (!counts[file.status]) counts[file.status] = 0;
      }
    }
    // Count unique diffs per status
    for (const status of ['added', 'modified', 'deleted', 'renamed'] as const) {
      counts[status] = diffs.filter(d => d.files.some(f => f.status === status)).length;
    }
    return counts;
  }, [diffs]);

  // Handle item selection
  const handleSelect = useCallback((diff: Diff) => {
    selectDiff(diff);
    // Auto-close is handled by context
  }, [selectDiff]);

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
          prev < filteredDiffs.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev > 0 ? prev - 1 : filteredDiffs.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredDiffs.length) {
          handleSelect(filteredDiffs[focusedIndex]);
        }
        break;
      case 'Tab':
        // Allow tab to close dropdown and move focus
        onClose();
        break;
    }
  }, [filteredDiffs, focusedIndex, handleSelect, onClose]);

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
  }, [filter]);

  return (
    <div
      ref={dropdownRef}
      role="listbox"
      aria-label="Select diff"
      className="
        absolute top-full right-0 mt-2 z-50
        w-[340px] max-h-[400px]
        bg-bg-elevated border border-[#10B981]/30 rounded-xl
        shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_0_1px_rgba(16,185,129,0.1)]
        animate-dropdown-in overflow-hidden
        flex flex-col
      "
    >
      {/* Filter tabs */}
      <div className="flex-shrink-0 p-2 border-b border-border bg-bg-secondary/50">
        <div className="flex items-center gap-1 overflow-x-auto">
          {FILTERS.map(({ key, label, icon }) => {
            const count = statusCounts[key] || 0;
            const isActive = filter === key;

            // Don't show empty filter options (except 'all')
            if (key !== 'all' && count === 0) return null;

            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`
                  flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold
                  transition-all flex-shrink-0
                  ${isActive
                    ? 'bg-[#10B981]/20 text-[#10B981]'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                  }
                `}
              >
                <span className="font-bold">{icon}</span>
                <span>{label}</span>
                <span className={`
                  min-w-[14px] h-[14px] px-0.5 rounded text-[9px] font-bold
                  flex items-center justify-center
                  ${isActive ? 'bg-[#10B981]/20' : 'bg-bg-hover'}
                `}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Diffs list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="text-center py-8">
            <svg className="w-8 h-8 mx-auto animate-spin text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-sm text-text-muted mt-2">Loading diffs...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <span className="text-3xl mb-2 block">⚠️</span>
            <p className="text-sm text-text-muted">{error}</p>
          </div>
        ) : filteredDiffs.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-3xl mb-2 block">📭</span>
            <p className="text-sm text-text-muted">
              {filter === 'all'
                ? 'No changes detected'
                : `No diffs with ${filter} files`
              }
            </p>
            <p className="text-xs text-text-muted/60 mt-1">
              Make changes to your code and refresh
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredDiffs.map((diff, index) => (
              <DiffDropdownItem
                key={diff.id}
                diff={diff}
                isSelected={selectedDiff?.id === diff.id}
                isFocused={focusedIndex === index}
                onClick={() => handleSelect(diff)}
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
