import { useState, useMemo } from 'react';
import type { Artifact, ArtifactType } from '../types';
import { ArtifactListItem } from './ArtifactListItem';

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

interface ArtifactsPanelProps {
  artifacts: Artifact[];
  isOpen: boolean;
  onClose: () => void;
  onSelectArtifact: (artifact: Artifact) => void;
}

export function ArtifactsPanel({
  artifacts,
  isOpen,
  onClose,
  onSelectArtifact,
}: ArtifactsPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Count per type for badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: artifacts.length };
    for (const artifact of artifacts) {
      counts[artifact.type] = (counts[artifact.type] || 0) + 1;
    }
    return counts;
  }, [artifacts]);

  // Filtered and sorted artifacts
  const filteredArtifacts = useMemo(() => {
    const filtered = filter === 'all'
      ? artifacts
      : artifacts.filter(a => a.type === filter);

    // Sort by createdAt descending (newest first)
    return [...filtered].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [artifacts, filter]);

  if (!isOpen) return null;

  return (
    <div
      className="
        flex-shrink-0 border-b border-border bg-bg-secondary/50 backdrop-blur-sm
        animate-slide-down overflow-hidden
      "
      style={{
        animation: 'slideDown 0.2s ease-out',
      }}
    >
      <div className="max-w-3xl mx-auto px-5 py-4">
        {/* Header with filters */}
        <div className="flex items-center justify-between mb-3">
          {/* Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
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
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                    border transition-all flex-shrink-0
                    ${isActive
                      ? 'bg-[#8B5CF6]/20 text-[#A78BFA] border-[#8B5CF6]/40'
                      : 'bg-bg-primary text-text-muted border-border hover:border-[#8B5CF6]/30'
                    }
                  `}
                >
                  <span>{label}</span>
                  <span className={`
                    min-w-[16px] h-[16px] px-1 rounded text-[10px] font-bold
                    flex items-center justify-center
                    ${isActive ? 'bg-[#8B5CF6]/20' : 'bg-bg-hover'}
                  `}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="
              w-7 h-7 flex items-center justify-center rounded-lg
              text-text-muted hover:text-text-primary hover:bg-bg-hover
              transition-colors flex-shrink-0
            "
          >
            ✕
          </button>
        </div>

        {/* Artifact List */}
        <div className="max-h-[280px] overflow-y-auto space-y-2">
          {filteredArtifacts.length === 0 ? (
            <div className="text-center py-6 text-sm text-text-muted">
              {filter === 'all'
                ? 'No artifacts yet'
                : `No ${filter.replace('_', ' ')} artifacts`
              }
            </div>
          ) : (
            filteredArtifacts.map(artifact => (
              <ArtifactListItem
                key={artifact._id}
                artifact={artifact}
                onClick={() => onSelectArtifact(artifact)}
              />
            ))
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            max-height: 0;
            opacity: 0;
          }
          to {
            max-height: 400px;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
