import { useState, useRef, useEffect, useCallback } from 'react';
import type { Workspace } from '@shared/types';

interface WorkspaceSelectProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelect: (workspaceId: string | null) => void;
  onCreateNew: () => void;
  accentColor?: 'orange' | 'linear';
}

/**
 * Abbreviate a path by replacing home directory with ~
 */
function abbreviatePath(path: string): string {
  // Try to detect home directory patterns
  // macOS/Linux: /Users/username or /home/username
  // Windows: C:\Users\username
  const homePatterns = [
    /^\/Users\/[^/]+/,
    /^\/home\/[^/]+/,
    /^[A-Z]:\\Users\\[^\\]+/i,
  ];

  for (const pattern of homePatterns) {
    const match = path.match(pattern);
    if (match) {
      return path.replace(match[0], '~');
    }
  }

  return path;
}

export function WorkspaceSelect({
  workspaces,
  selectedWorkspaceId,
  onSelect,
  onCreateNew,
  accentColor = 'orange',
}: WorkspaceSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!isOpen) {
        e.preventDefault();
        setIsOpen(true);
      }
    }
  }, [isOpen]);

  const handleSelect = useCallback((workspaceId: string | null) => {
    onSelect(workspaceId);
    setIsOpen(false);
  }, [onSelect]);

  const handleCreateNew = useCallback(() => {
    setIsOpen(false);
    onCreateNew();
  }, [onCreateNew]);

  const accentClasses = accentColor === 'linear'
    ? {
        focusBorder: 'focus:border-[#5E6AD2]/60',
        focusRing: 'focus:ring-[#5E6AD2]/15',
        hoverBorder: 'hover:border-[#5E6AD2]/40',
        selectedBg: 'bg-[#5E6AD2]/10',
        selectedBorder: 'border-[#5E6AD2]/30',
        textColor: 'text-[#5E6AD2]',
        createBg: 'bg-[#5E6AD2]/10',
        createHover: 'hover:bg-[#5E6AD2]/20',
        createBorder: 'border-[#5E6AD2]/30',
      }
    : {
        focusBorder: 'focus:border-orange/60',
        focusRing: 'focus:ring-orange/15',
        hoverBorder: 'hover:border-orange/40',
        selectedBg: 'bg-orange/10',
        selectedBorder: 'border-orange/30',
        textColor: 'text-orange',
        createBg: 'bg-orange/10',
        createHover: 'hover:bg-orange/20',
        createBorder: 'border-orange/30',
      };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`
          w-full bg-bg-primary border border-border rounded-xl px-4 py-3
          text-left transition-all
          ${accentClasses.focusBorder} focus:ring-2 ${accentClasses.focusRing} focus:outline-none
          ${isOpen ? `${accentClasses.focusBorder} ring-2 ${accentClasses.focusRing}` : accentClasses.hoverBorder}
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {selectedWorkspace ? (
              <>
                <div className="font-medium text-text-primary truncate">
                  {selectedWorkspace.name}
                </div>
                <div className="text-xs text-text-muted font-mono truncate mt-0.5">
                  {abbreviatePath(selectedWorkspace.path)}
                </div>
              </>
            ) : (
              <div className="text-text-muted">Select a workspace...</div>
            )}
          </div>
          {/* Chevron icon */}
          <svg
            className={`w-4 h-4 text-text-muted transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-bg-elevated border border-border rounded-xl shadow-modal overflow-hidden animate-modal-slide">
          {/* Workspace list */}
          <div className="max-h-[240px] overflow-y-auto">
            {workspaces.length === 0 ? (
              <div className="px-4 py-6 text-center text-text-muted text-sm">
                No workspaces yet
              </div>
            ) : (
              workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => handleSelect(workspace.id)}
                  className={`
                    w-full px-4 py-3 text-left transition-all
                    ${selectedWorkspaceId === workspace.id
                      ? `${accentClasses.selectedBg} border-l-2 ${accentClasses.selectedBorder}`
                      : 'hover:bg-bg-hover border-l-2 border-transparent'
                    }
                  `}
                >
                  <div className={`font-medium truncate ${selectedWorkspaceId === workspace.id ? accentClasses.textColor : 'text-text-primary'}`}>
                    {workspace.name}
                  </div>
                  <div className="text-xs text-text-muted font-mono truncate mt-0.5">
                    {abbreviatePath(workspace.path)}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Create new workspace option */}
          <button
            type="button"
            onClick={handleCreateNew}
            className={`
              w-full px-4 py-3 text-left transition-all flex items-center gap-2
              ${accentClasses.createBg} ${accentClasses.createHover}
            `}
          >
            <span className={`w-5 h-5 rounded-md ${accentClasses.createBg} border ${accentClasses.createBorder} flex items-center justify-center text-xs font-bold ${accentClasses.textColor}`}>
              +
            </span>
            <span className={`font-semibold ${accentClasses.textColor}`}>
              Create new workspace
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

// Export utility function for use in other components
export { abbreviatePath };
