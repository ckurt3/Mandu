import { useState, useCallback, useRef, useEffect } from 'react';
import { DirectoryBrowser } from './DirectoryBrowser';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, path: string) => void;
  accentColor?: 'orange' | 'linear';
}

/**
 * Extract folder name from a path
 */
function getFolderName(path: string): string {
  // Remove trailing slashes and get last segment
  const cleaned = path.replace(/\/+$/, '');
  const segments = cleaned.split('/');
  return segments[segments.length - 1] || '';
}

/**
 * Abbreviate a path by replacing home directory with ~
 */
function abbreviatePath(path: string): string {
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

export function CreateWorkspaceModal({
  isOpen,
  onClose,
  onCreate,
  accentColor = 'orange',
}: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setPath('');
      setError(null);
      setShowBrowser(false);
    }
  }, [isOpen]);

  const handleFolderSelect = useCallback((selectedPath: string) => {
    setPath(selectedPath);
    // Auto-fill name if empty
    if (!name) {
      setName(getFolderName(selectedPath));
    }
    setShowBrowser(false);
  }, [name]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedPath = path.trim();

    if (!trimmedName) {
      setError('Please enter a workspace name');
      return;
    }

    if (!trimmedPath) {
      setError('Please select a folder');
      return;
    }

    onCreate(trimmedName, trimmedPath);
    onClose();
  }, [name, path, onCreate, onClose]);

  const accentClasses = accentColor === 'linear'
    ? {
        headerGradient: 'from-[#5E6AD2]/5',
        iconBg: 'bg-[#5E6AD2]/15',
        iconBorder: 'border-[#5E6AD2]/25',
        inputFocus: 'focus:border-[#5E6AD2]/60 focus:ring-[#5E6AD2]/15',
        buttonBg: 'bg-[#5E6AD2]',
        buttonHover: 'hover:bg-[#4E5AC2]',
        buttonShadow: 'shadow-[0_2px_8px_rgba(94,106,210,0.25)]',
        browseBg: 'bg-[#5E6AD2]',
        browseHover: 'hover:bg-[#4E5AC2]',
      }
    : {
        headerGradient: 'from-orange/5',
        iconBg: 'bg-orange/15',
        iconBorder: 'border-orange/25',
        inputFocus: 'focus:border-orange/60 focus:ring-orange/15',
        buttonBg: 'bg-orange',
        buttonHover: 'hover:bg-orange-dark',
        buttonShadow: 'shadow-[0_2px_8px_rgba(255,140,66,0.25)]',
        browseBg: 'bg-orange',
        browseHover: 'hover:bg-orange-dark',
      };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-modal-fade"
        onClick={onClose}
      >
        <div
          className="bg-bg-elevated border border-border rounded-2xl w-full max-w-md shadow-modal animate-modal-slide overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className={`flex items-center justify-between p-5 border-b border-border bg-gradient-to-r ${accentClasses.headerGradient} to-transparent`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${accentClasses.iconBg} border ${accentClasses.iconBorder} flex items-center justify-center text-xl`}>
                📁
              </div>
              <h2 className="text-lg font-bold text-text-primary">Create Workspace</h2>
            </div>
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-all"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          {/* Modal Body */}
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">
            {/* Error message */}
            {error && (
              <div className="px-4 py-3 bg-red-dim border border-red/30 rounded-xl text-red text-sm">
                {error}
              </div>
            )}

            {/* Workspace Name */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-text-secondary">
                Workspace Name
              </label>
              <input
                ref={nameInputRef}
                type="text"
                placeholder="e.g., Personal Projects"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`
                  w-full bg-bg-primary border border-border rounded-xl px-4 py-3
                  text-text-primary placeholder:text-text-muted
                  focus:outline-none focus:ring-2 transition-all
                  ${accentClasses.inputFocus}
                `}
              />
            </div>

            {/* Folder Path */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-text-secondary">
                Folder
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBrowser(true)}
                  className={`
                    px-4 py-3 rounded-xl text-white font-semibold text-sm
                    transition-all flex items-center gap-2 flex-shrink-0
                    ${accentClasses.browseBg} ${accentClasses.browseHover}
                  `}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Browse
                </button>

                <div className={`
                  flex-1 bg-bg-primary border border-border rounded-xl px-4 py-3
                  text-sm font-mono min-w-0 flex items-center
                  ${path ? 'text-text-primary' : 'text-text-muted'}
                `}>
                  {path ? abbreviatePath(path) : 'No folder selected'}
                </div>
              </div>

              <span className="text-xs text-text-muted">
                Click Browse to select a folder for this workspace
              </span>
            </div>
          </form>

          {/* Modal Footer */}
          <div className="flex justify-end gap-3 p-5 border-t border-border bg-bg-secondary/30">
            <button
              type="button"
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-text-secondary hover:bg-bg-hover transition-all"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || !path.trim()}
              className={`
                px-5 py-2.5 rounded-xl text-sm font-bold text-white
                active:scale-[0.98] transition-all
                disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                ${accentClasses.buttonBg} ${accentClasses.buttonHover} ${accentClasses.buttonShadow}
              `}
            >
              Create Workspace
            </button>
          </div>
        </div>
      </div>

      {/* Directory Browser Modal */}
      <DirectoryBrowser
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={handleFolderSelect}
        accentColor={accentColor}
      />
    </>
  );
}
