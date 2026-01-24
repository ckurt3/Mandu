import { useState, useEffect, useCallback } from 'react';

interface DirectoryEntry {
  name: string;
  path: string;
}

interface DirectoryResponse {
  currentPath: string;
  displayPath: string;
  parentPath: string | null;
  directories: DirectoryEntry[];
}

interface DirectoryBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  accentColor?: 'orange' | 'linear';
}

export function DirectoryBrowser({
  isOpen,
  onClose,
  onSelect,
  accentColor = 'orange',
}: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState('~');
  const [displayPath, setDisplayPath] = useState('~');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectories = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/directories?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load directories');
      }

      const data: DirectoryResponse = await response.json();
      setCurrentPath(data.currentPath);
      setDisplayPath(data.displayPath);
      setParentPath(data.parentPath);
      setDirectories(data.directories);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial directory when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchDirectories('~');
    }
  }, [isOpen, fetchDirectories]);

  const handleNavigate = useCallback((path: string) => {
    fetchDirectories(path);
  }, [fetchDirectories]);

  const handleSelect = useCallback(() => {
    onSelect(currentPath);
    onClose();
  }, [currentPath, onSelect, onClose]);

  const accentClasses = accentColor === 'linear'
    ? {
        headerGradient: 'from-[#5E6AD2]/5',
        iconBg: 'bg-[#5E6AD2]/15',
        iconBorder: 'border-[#5E6AD2]/25',
        buttonBg: 'bg-[#5E6AD2]',
        buttonHover: 'hover:bg-[#4E5AC2]',
        buttonShadow: 'shadow-[0_2px_8px_rgba(94,106,210,0.25)]',
        itemHover: 'hover:bg-[#5E6AD2]/10',
        breadcrumbHover: 'hover:text-[#5E6AD2]',
      }
    : {
        headerGradient: 'from-orange/5',
        iconBg: 'bg-orange/15',
        iconBorder: 'border-orange/25',
        buttonBg: 'bg-orange',
        buttonHover: 'hover:bg-orange-dark',
        buttonShadow: 'shadow-[0_2px_8px_rgba(255,140,66,0.25)]',
        itemHover: 'hover:bg-orange/10',
        breadcrumbHover: 'hover:text-orange',
      };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-modal-fade"
      onClick={onClose}
    >
      <div
        className="bg-bg-elevated border border-border rounded-2xl w-full max-w-lg shadow-modal animate-modal-slide overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b border-border bg-gradient-to-r ${accentClasses.headerGradient} to-transparent`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${accentClasses.iconBg} border ${accentClasses.iconBorder} flex items-center justify-center text-lg`}>
              📁
            </div>
            <h2 className="text-base font-bold text-text-primary">Select Folder</h2>
          </div>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-all"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Breadcrumb / Current Path */}
        <div className="px-4 py-3 border-b border-border bg-bg-secondary/30">
          <div className="flex items-center gap-2">
            {parentPath && (
              <button
                type="button"
                onClick={() => handleNavigate(parentPath)}
                className={`p-1.5 rounded-lg text-text-muted ${accentClasses.breadcrumbHover} hover:bg-bg-hover transition-all`}
                title="Go up"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <code className="flex-1 text-sm font-mono text-text-primary bg-bg-primary px-3 py-1.5 rounded-lg border border-border truncate">
              {displayPath}
            </code>
          </div>
        </div>

        {/* Directory List */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="w-6 h-6 border-2 border-border border-t-text-muted rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-red text-sm">{error}</p>
              <button
                type="button"
                onClick={() => fetchDirectories('~')}
                className="mt-3 text-sm text-text-muted hover:text-text-primary underline"
              >
                Go to home directory
              </button>
            </div>
          ) : directories.length === 0 ? (
            <div className="px-4 py-12 text-center text-text-muted text-sm">
              No subfolders in this directory
            </div>
          ) : (
            <div className="py-1">
              {directories.map((dir) => (
                <button
                  key={dir.path}
                  type="button"
                  onClick={() => handleNavigate(dir.path)}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-all ${accentClasses.itemHover}`}
                >
                  <span className="text-lg">📁</span>
                  <span className="text-sm text-text-primary truncate">{dir.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-border bg-bg-secondary/30">
          <p className="text-xs text-text-muted truncate">
            Select this folder or navigate into a subfolder
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-sm font-semibold text-text-secondary hover:bg-bg-hover transition-all"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSelect}
              disabled={loading}
              className={`
                px-4 py-2 rounded-xl text-sm font-bold text-white
                active:scale-[0.98] transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
                ${accentClasses.buttonBg} ${accentClasses.buttonHover} ${accentClasses.buttonShadow}
              `}
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
