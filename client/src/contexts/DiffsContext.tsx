import { createContext, useState, useCallback, useMemo, useContext, useEffect, type ReactNode } from 'react';
import type { Diff, DiffViewMode } from '@shared/types';

export interface DiffsContextValue {
  // State
  diffs: Diff[];
  selectedDiff: Diff | null;
  isDropdownOpen: boolean;
  viewMode: DiffViewMode;
  isLoading: boolean;
  error: string | null;

  // Actions
  toggleDropdown: () => void;
  openDropdown: () => void;
  closeDropdown: () => void;
  selectDiff: (diff: Diff | null) => void;
  setViewMode: (mode: DiffViewMode) => void;
  fetchDiffs: (projectId: string) => Promise<void>;
  refreshDiffs: () => Promise<void>;
}

// Context
export const DiffsContext = createContext<DiffsContextValue | undefined>(undefined);

// Provider Props
interface DiffsProviderProps {
  children: ReactNode;
  projectId?: string | null;
}

export function DiffsProvider({ children, projectId }: DiffsProviderProps) {
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [selectedDiff, setSelectedDiff] = useState<Diff | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<DiffViewMode>('line-by-line');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const toggleDropdown = useCallback(() => {
    setIsDropdownOpen(prev => !prev);
  }, []);

  const openDropdown = useCallback(() => {
    setIsDropdownOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsDropdownOpen(false);
  }, []);

  // Select diff and auto-close dropdown
  const selectDiff = useCallback((diff: Diff | null) => {
    setSelectedDiff(diff);
    // Auto-close dropdown when diff is selected
    if (diff) {
      setIsDropdownOpen(false);
    }
  }, []);

  // Fetch diffs from the API
  const fetchDiffs = useCallback(async (projId: string) => {
    if (!projId) {
      setDiffs([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCurrentProjectId(projId);

    try {
      // Use relative URL - Vite proxy handles forwarding to backend in dev mode
      const response = await fetch(`/api/projects/${projId}/diff`);

      if (!response.ok) {
        if (response.status === 400) {
          const data = await response.json();
          // Not a git repo or other expected errors - just show empty
          setDiffs([]);
          setError(data.error || 'No git repository found');
          return;
        }
        throw new Error(`Failed to fetch diff: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.diff && data.diff.files && data.diff.files.length > 0) {
        // Wrap single diff in array for consistent handling
        setDiffs([data.diff]);
        setError(null);
      } else {
        // No changes
        setDiffs([]);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching diffs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch diffs');
      setDiffs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh diffs using the current project ID
  const refreshDiffs = useCallback(async () => {
    if (currentProjectId) {
      await fetchDiffs(currentProjectId);
    }
  }, [currentProjectId, fetchDiffs]);

  // Fetch diffs when project changes
  useEffect(() => {
    if (projectId) {
      fetchDiffs(projectId);
    } else {
      setDiffs([]);
      setSelectedDiff(null);
      setError(null);
      setCurrentProjectId(null);
    }
  }, [projectId, fetchDiffs]);

  const value = useMemo(
    () => ({
      diffs,
      selectedDiff,
      isDropdownOpen,
      viewMode,
      isLoading,
      error,
      toggleDropdown,
      openDropdown,
      closeDropdown,
      selectDiff,
      setViewMode,
      fetchDiffs,
      refreshDiffs,
    }),
    [
      diffs,
      selectedDiff,
      isDropdownOpen,
      viewMode,
      isLoading,
      error,
      toggleDropdown,
      openDropdown,
      closeDropdown,
      selectDiff,
      fetchDiffs,
      refreshDiffs,
    ]
  );

  return (
    <DiffsContext.Provider value={value}>
      {children}
    </DiffsContext.Provider>
  );
}

// Custom hook for consuming the context
export function useDiffs() {
  const context = useContext(DiffsContext);
  if (context === undefined) {
    throw new Error('useDiffs must be used within a DiffsProvider');
  }
  return context;
}
