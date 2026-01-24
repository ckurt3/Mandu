import { useEffect, useMemo, useCallback } from 'react';
import { html, parse } from 'diff2html';
import { ColorSchemeType } from 'diff2html/lib-esm/types';
import type { Diff, DiffViewMode, DiffFile } from '@shared/types';
import { useDiffs } from '../../contexts/DiffsContext';

// File status configuration for display
const FILE_STATUS_CONFIG: Record<DiffFile['status'], { icon: string; label: string; color: string }> = {
  added: { icon: '+', label: 'Added', color: 'text-green' },
  deleted: { icon: '−', label: 'Deleted', color: 'text-red' },
  modified: { icon: '~', label: 'Modified', color: 'text-golden' },
  renamed: { icon: '→', label: 'Renamed', color: 'text-[#A78BFA]' },
};

interface GitDiffViewerProps {
  diff: Diff;
}

export function GitDiffViewer({ diff }: GitDiffViewerProps) {
  const { selectDiff, viewMode, setViewMode } = useDiffs();

  // Parse the diff and generate HTML
  const diffHtml = useMemo(() => {
    if (!diff.rawDiff) return '';

    try {
      // Parse the unified diff
      const diffJson = parse(diff.rawDiff);

      // Generate HTML with diff2html
      const htmlOutput = html(diffJson, {
        drawFileList: false, // We'll render our own file list
        matching: 'lines',
        outputFormat: viewMode,
        renderNothingWhenEmpty: false,
        // Enable syntax highlighting
        colorScheme: ColorSchemeType.AUTO,
        // Preserve line numbers for future commenting feature
      });

      return htmlOutput;
    } catch (error) {
      console.error('Failed to parse diff:', error);
      return `<div class="p-4 text-red">Failed to parse diff content</div>`;
    }
  }, [diff.rawDiff, viewMode]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalAdditions = diff.files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = diff.files.reduce((sum, f) => sum + f.deletions, 0);
    return { totalAdditions, totalDeletions, fileCount: diff.files.length };
  }, [diff.files]);

  // Handle ESC key to close viewer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectDiff(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectDiff]);

  // Toggle view mode
  const handleToggleViewMode = useCallback(() => {
    setViewMode(viewMode === 'line-by-line' ? 'side-by-side' : 'line-by-line');
  }, [viewMode, setViewMode]);

  // Scroll to a specific file in the diff
  const scrollToFile = useCallback((filename: string) => {
    // Find the file wrapper element and scroll to it
    const fileElements = document.querySelectorAll('.d2h-file-wrapper');
    for (const el of fileElements) {
      const header = el.querySelector('.d2h-file-header');
      if (header?.textContent?.includes(filename)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-primary">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-4 px-6 py-4 border-b border-border bg-gradient-to-r from-[#10B981]/5 to-transparent">
        {/* Diff Icon */}
        <span className="w-10 h-10 flex items-center justify-center text-lg font-bold rounded-xl bg-[#10B981]/15 text-[#10B981]">
          ⎇
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/25">
              Code Diff
            </span>
            {diff.baseRef && diff.headRef && (
              <span className="text-xs text-text-muted font-mono">
                {diff.baseRef} → {diff.headRef}
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold text-text-primary truncate">
            {diff.title}
          </h1>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 text-text-muted">
            <span className="font-mono">{stats.fileCount}</span>
            <span className="text-xs">files</span>
          </span>
          <span className="flex items-center gap-1 text-green">
            <span>+</span>
            <span className="font-mono">{stats.totalAdditions}</span>
          </span>
          <span className="flex items-center gap-1 text-red">
            <span>−</span>
            <span className="font-mono">{stats.totalDeletions}</span>
          </span>
        </div>

        {/* View Mode Toggle */}
        <button
          onClick={handleToggleViewMode}
          className="
            px-3 py-1.5 rounded-lg text-xs font-semibold
            bg-bg-elevated border border-border text-text-secondary
            hover:bg-bg-hover hover:border-[#10B981]/40 hover:text-[#10B981]
            transition-all flex items-center gap-1.5
          "
          title={viewMode === 'line-by-line' ? 'Switch to side-by-side view' : 'Switch to inline view'}
        >
          {viewMode === 'line-by-line' ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              <span>Split</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>Inline</span>
            </>
          )}
        </button>

        {/* Close button */}
        <button
          onClick={() => selectDiff(null)}
          className="
            w-9 h-9 flex items-center justify-center rounded-lg
            text-text-muted hover:text-text-primary hover:bg-bg-hover
            border border-transparent hover:border-border
            transition-all
          "
          aria-label="Close diff viewer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content area with file list sidebar */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* File List Sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-border bg-bg-secondary/30 overflow-y-auto">
          <div className="p-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-2">
              <span className="text-[#10B981]">◈</span>
              Changed Files
            </h3>
            <div className="flex flex-col gap-1">
              {diff.files.map((file) => {
                const statusConfig = FILE_STATUS_CONFIG[file.status];
                return (
                  <button
                    key={file.id}
                    onClick={() => scrollToFile(file.filename)}
                    className="
                      w-full text-left p-2 rounded-lg
                      bg-bg-elevated border border-border
                      hover:border-[#10B981]/40 hover:bg-bg-hover
                      transition-all group
                    "
                    data-file-id={file.id}
                    data-line-start="1"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-bold ${statusConfig.color}`}>
                        {statusConfig.icon}
                      </span>
                      <span className="text-xs font-mono text-text-primary truncate flex-1">
                        {file.filename.split('/').pop()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-muted truncate max-w-[140px]" title={file.filename}>
                        {file.filename.includes('/') ? file.filename.substring(0, file.filename.lastIndexOf('/')) : '.'}
                      </span>
                      <span className="text-[10px] flex items-center gap-1">
                        <span className="text-green">+{file.additions}</span>
                        <span className="text-red">−{file.deletions}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto">
          {diff.description && (
            <div className="px-6 py-4 border-b border-border bg-bg-secondary/30">
              <p className="text-sm text-text-secondary">{diff.description}</p>
            </div>
          )}

          {/* Diff2Html output with custom styling */}
          <div
            className="diff2html-wrapper"
            dangerouslySetInnerHTML={{ __html: diffHtml }}
          />
        </div>
      </div>
    </div>
  );
}
