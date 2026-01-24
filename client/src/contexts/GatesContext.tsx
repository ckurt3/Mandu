import { createContext, useState, useCallback, useMemo, useContext, type ReactNode } from 'react';
import type { Gate } from '@shared/types';

export type GateFilterType = 'all' | 'pending' | 'approved' | 'rejected';

export interface GatesContextValue {
  // State
  selectedGate: Gate | null;
  isDropdownOpen: boolean;
  filterType: GateFilterType;

  // Actions
  toggleDropdown: () => void;
  openDropdown: () => void;
  closeDropdown: () => void;
  selectGate: (gate: Gate | null) => void;
  setFilterType: (filter: GateFilterType) => void;
}

// Context
export const GatesContext = createContext<GatesContextValue | undefined>(undefined);

// Provider Props
interface GatesProviderProps {
  children: ReactNode;
}

export function GatesProvider({ children }: GatesProviderProps) {
  const [selectedGate, setSelectedGate] = useState<Gate | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filterType, setFilterType] = useState<GateFilterType>('all');

  const toggleDropdown = useCallback(() => {
    setIsDropdownOpen(prev => !prev);
  }, []);

  const openDropdown = useCallback(() => {
    setIsDropdownOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsDropdownOpen(false);
  }, []);

  // Select gate and auto-close dropdown
  const selectGate = useCallback((gate: Gate | null) => {
    setSelectedGate(gate);
    // Auto-close dropdown when gate is selected
    if (gate) {
      setIsDropdownOpen(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      selectedGate,
      isDropdownOpen,
      filterType,
      toggleDropdown,
      openDropdown,
      closeDropdown,
      selectGate,
      setFilterType,
    }),
    [selectedGate, isDropdownOpen, filterType, toggleDropdown, openDropdown, closeDropdown, selectGate]
  );

  return (
    <GatesContext.Provider value={value}>
      {children}
    </GatesContext.Provider>
  );
}

// Custom hook for consuming the context
export function useGates() {
  const context = useContext(GatesContext);
  if (context === undefined) {
    throw new Error('useGates must be used within a GatesProvider');
  }
  return context;
}
