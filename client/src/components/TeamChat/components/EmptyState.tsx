interface EmptyStateProps {
  isInitializing: boolean;
  projectName: string;
}

export function EmptyState({ isInitializing, projectName }: EmptyStateProps) {
  return (
    <div className="empty-state-container">
      <div className={`empty-state-icon ${isInitializing ? 'animate-pulse-glow' : ''}`}>
        <span className="text-4xl">🥟</span>
      </div>
      {isInitializing ? (
        <>
          <h3 className="empty-state-title">Initializing your AI team...</h3>
          <p className="empty-state-subtitle">
            The Engineering Manager is setting up <span className="text-orange font-semibold">{projectName}</span>
          </p>
          <div className="mt-5 flex items-center gap-2.5 text-sm text-text-muted font-mono">
            <span className="w-2 h-2 rounded-full bg-orange animate-pulse" />
            <span>Analyzing project requirements</span>
          </div>
        </>
      ) : (
        <>
          <h3 className="empty-state-title">Ready to collaborate</h3>
          <p className="empty-state-subtitle">
            Send a message to start working with your AI team on <span className="text-orange font-semibold">{projectName}</span>
          </p>
          <div className="mt-5 keyboard-hints">
            <span className="hint"><kbd className="command-kbd">Enter</kbd> to send</span>
            <span className="hint"><kbd className="command-kbd">/</kbd> for commands</span>
          </div>
        </>
      )}
    </div>
  );
}
