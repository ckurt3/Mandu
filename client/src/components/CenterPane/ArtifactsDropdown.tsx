import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Artifact, ArtifactType } from '@shared/types';
import { ArtifactDropdownItem } from './ArtifactDropdownItem';
import { useArtifacts } from '../../contexts/ArtifactsContext';

type FilterType = 'all' | ArtifactType;

interface FilterConfig {
  key: FilterType;
  label: string;
  icon: string;
}

const FILTERS: FilterConfig[] = [
  { key: 'all', label: 'All', icon: '📦' },
  { key: 'spec', label: 'Specs', icon: '📋' },
  { key: 'design_doc', label: 'Design', icon: '🏗️' },
  { key: 'code_change', label: 'Code', icon: '💻' },
  { key: 'test_report', label: 'Tests', icon: '🧪' },
];

interface ArtifactsDropdownProps {
  artifacts: Artifact[];
  onClose: () => void;
}

export function ArtifactsDropdown({ artifacts, onClose }: ArtifactsDropdownProps) {
  const { selectedArtifact, selectArtifact } = useArtifacts();
  const [filter, setFilter] = useState<FilterType>('all');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter artifacts
  const filteredArtifacts = useMemo(() => {
    const filtered = filter === 'all'
      ? artifacts
      : artifacts.filter(a => a.type === filter);

    // Sort by createdAt descending (newest first)
    return [...filtered].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [artifacts, filter]);

  // Count per type for badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: artifacts.length };
    for (const artifact of artifacts) {
      counts[artifact.type] = (counts[artifact.type] || 0) + 1;
    }
    return counts;
  }, [artifacts]);

  // Handle item selection
  const handleSelect = useCallback((artifact: Artifact) => {
    selectArtifact(artifact);
    // Auto-close is handled by context
  }, [selectArtifact]);

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
          prev < filteredArtifacts.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev > 0 ? prev - 1 : filteredArtifacts.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredArtifacts.length) {
          handleSelect(filteredArtifacts[focusedIndex]);
        }
        break;
      case 'Tab':
        // Allow tab to close dropdown and move focus
        onClose();
        break;
    }
  }, [filteredArtifacts, focusedIndex, handleSelect, onClose]);

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
      aria-label="Select artifact"
      className="
        absolute top-full right-0 mt-2 z-50
        w-[320px] max-h-[400px]
        bg-bg-elevated border border-[#8B5CF6]/30 rounded-xl
        shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_0_1px_rgba(139,92,246,0.1)]
        animate-dropdown-in overflow-hidden
        flex flex-col
      "
    >
      {/* Filter tabs */}
      <div className="flex-shrink-0 p-2 border-b border-border bg-bg-secondary/50">
        <div className="flex items-center gap-1 overflow-x-auto">
          {FILTERS.map(({ key, label }) => {
            const count = typeCounts[key] || 0;
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
                    ? 'bg-[#8B5CF6]/20 text-[#A78BFA]'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                  }
                `}
              >
                <span>{label}</span>
                <span className={`
                  min-w-[14px] h-[14px] px-0.5 rounded text-[9px] font-bold
                  flex items-center justify-center
                  ${isActive ? 'bg-[#8B5CF6]/20' : 'bg-bg-hover'}
                `}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Artifacts list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2">
        {filteredArtifacts.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-3xl mb-2 block">📭</span>
            <p className="text-sm text-text-muted">
              {filter === 'all'
                ? 'No artifacts yet'
                : `No ${filter.replace('_', ' ')} artifacts`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredArtifacts.map((artifact, index) => (
              <ArtifactDropdownItem
                key={artifact.id}
                artifact={artifact}
                isSelected={selectedArtifact?.id === artifact.id}
                isFocused={focusedIndex === index}
                onClick={() => handleSelect(artifact)}
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
