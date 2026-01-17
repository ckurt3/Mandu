import { createContext, useState, useCallback, useMemo, useContext, type ReactNode } from 'react';
import type { Artifact } from '@shared/types';

export interface ArtifactsContextValue {
  // State
  selectedArtifact: Artifact | null;
  isDropdownOpen: boolean;

  // Actions
  toggleDropdown: () => void;
  openDropdown: () => void;
  closeDropdown: () => void;
  selectArtifact: (artifact: Artifact | null) => void;
}

// Context
export const ArtifactsContext = createContext<ArtifactsContextValue | undefined>(undefined);

// Provider Props
interface ArtifactsProviderProps {
  children: ReactNode;
}

export function ArtifactsProvider({ children }: ArtifactsProviderProps) {
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const toggleDropdown = useCallback(() => {
    setIsDropdownOpen(prev => !prev);
  }, []);

  const openDropdown = useCallback(() => {
    setIsDropdownOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsDropdownOpen(false);
  }, []);

  // Select artifact and auto-close dropdown
  const selectArtifact = useCallback((artifact: Artifact | null) => {
    setSelectedArtifact(artifact);
    // Auto-close dropdown when artifact is selected
    if (artifact) {
      setIsDropdownOpen(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      selectedArtifact,
      isDropdownOpen,
      toggleDropdown,
      openDropdown,
      closeDropdown,
      selectArtifact,
    }),
    [selectedArtifact, isDropdownOpen, toggleDropdown, openDropdown, closeDropdown, selectArtifact]
  );

  return (
    <ArtifactsContext.Provider value={value}>
      {children}
    </ArtifactsContext.Provider>
  );
}

// Custom hook for consuming the context
export function useArtifacts() {
  const context = useContext(ArtifactsContext);
  if (context === undefined) {
    throw new Error('useArtifacts must be used within an ArtifactsProvider');
  }
  return context;
}
