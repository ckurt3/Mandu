import { useState, useEffect, useMemo, useCallback, KeyboardEvent, RefObject } from 'react';
import type { SlashCommand } from '../types';

interface UseCommandPaletteOptions {
  inputRef: RefObject<HTMLInputElement>;
}

interface UseCommandPaletteReturn {
  slashCommands: SlashCommand[];
  showCommandPalette: boolean;
  filteredCommands: SlashCommand[];
  selectedCommandIndex: number;
  handleInputChange: (value: string, setInput: (v: string) => void) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>, setInput: (v: string) => void) => boolean;
  closePalette: () => void;
}

export function useCommandPalette({ inputRef }: UseCommandPaletteOptions): UseCommandPaletteReturn {
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandFilter, setCommandFilter] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Fetch slash commands on mount
  useEffect(() => {
    const fetchCommands = async () => {
      try {
        const res = await fetch('/api/commands');
        if (res.ok) {
          const { commands } = await res.json();
          setSlashCommands(commands);
        }
      } catch (err) {
        console.error('Failed to fetch slash commands:', err);
      }
    };
    fetchCommands();
  }, []);

  // Filtered commands for palette
  const filteredCommands = useMemo(() =>
    slashCommands.filter(cmd =>
      cmd.name.toLowerCase().includes(commandFilter.toLowerCase())
    ),
    [slashCommands, commandFilter]
  );

  // Select a command from the palette
  const selectCommand = useCallback((command: SlashCommand, setInput: (v: string) => void) => {
    setInput(command.name + ' ');
    setShowCommandPalette(false);
    setCommandFilter('');
    inputRef.current?.focus();
  }, [inputRef]);

  // Handle input changes for command palette
  const handleInputChange = useCallback((value: string, setInput: (v: string) => void) => {
    setInput(value);

    // Show command palette when starting with / and no spaces yet
    const shouldShowPalette = value.startsWith('/') && !value.includes(' ');

    if (shouldShowPalette) {
      const filter = value.slice(1);
      setCommandFilter(filter);
      setSelectedCommandIndex(0);
      setShowCommandPalette(true);
    } else if (showCommandPalette) {
      setShowCommandPalette(false);
      setCommandFilter('');
    }
  }, [showCommandPalette]);

  // Keyboard handler for command palette navigation
  // Returns true if the event was handled by the palette
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, setInput: (v: string) => void): boolean => {
    if (showCommandPalette && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(prev =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        return true;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectCommand(filteredCommands[selectedCommandIndex], setInput);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommandPalette(false);
        return true;
      }
    }
    return false;
  }, [showCommandPalette, filteredCommands, selectedCommandIndex, selectCommand]);

  const closePalette = useCallback(() => {
    setShowCommandPalette(false);
    setCommandFilter('');
  }, []);

  return {
    slashCommands,
    showCommandPalette,
    filteredCommands,
    selectedCommandIndex,
    handleInputChange,
    handleKeyDown,
    closePalette,
  };
}
