import type { SlashCommand } from '../types';

interface CommandPaletteProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelectCommand: (command: SlashCommand) => void;
}

export function CommandPalette({
  commands,
  selectedIndex,
  onSelectCommand,
}: CommandPaletteProps) {
  if (commands.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-4 right-4 mb-2 rounded-xl overflow-hidden command-palette-enter z-50"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4), 0 -2px 8px rgba(0, 0, 0, 0.2)',
        maxHeight: '280px',
        overflowY: 'auto',
      }}
    >
      <div
        className="px-4 py-2 font-mono text-xs uppercase tracking-wider"
        style={{
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        Commands
      </div>
      {commands.map((cmd, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <button
            key={`${cmd.name}-${cmd.source}`}
            type="button"
            onClick={() => onSelectCommand(cmd)}
            className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
            style={{
              background: isSelected ? 'var(--accent)' : 'transparent',
            }}
          >
            <span
              className="font-mono text-sm font-semibold"
              style={{ color: isSelected ? 'var(--bg-base)' : 'var(--accent)' }}
            >
              {cmd.name}
            </span>
            <span
              className="text-sm truncate flex-1"
              style={{ color: isSelected ? 'var(--bg-base)' : 'var(--text-secondary)' }}
            >
              {cmd.description}
            </span>
            <span
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={{
                background: isSelected ? 'rgba(0,0,0,0.2)' : (cmd.source === 'project' ? 'var(--accent-muted)' : 'var(--bg-base)'),
                color: isSelected ? 'var(--bg-base)' : (cmd.source === 'project' ? 'var(--accent)' : 'var(--text-muted)'),
              }}
            >
              {cmd.source}
            </span>
          </button>
        );
      })}
      <div
        className="px-4 py-2 font-mono text-xs flex gap-4"
        style={{
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        <span><kbd className="command-kbd">up/down</kbd> navigate</span>
        <span><kbd className="command-kbd">Tab</kbd> select</span>
        <span><kbd className="command-kbd">Esc</kbd> close</span>
      </div>
    </div>
  );
}
