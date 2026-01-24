import { useCallback, useState, useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { SlideMenu } from './components/SlideMenu';
import { RightPane } from './components/RightPane';
import { ThemeProvider } from './contexts/ThemeContext';
import { ArtifactsProvider, useArtifacts } from './contexts/ArtifactsContext';
import { GatesProvider, useGates } from './contexts/GatesContext';
import { DiffsProvider, useDiffs } from './contexts/DiffsContext';
import { ThemeToggle } from './components/ThemeToggle';
import { CenterTopBar, ArtifactViewer, GateViewer, GitDiffViewer } from './components/CenterPane';
import { WorkspaceSelect } from './components/WorkspaceSelect';
import { CreateWorkspaceModal } from './components/CreateWorkspaceModal';
import { AgentCardsPane, AgentNavigationProvider } from './components/AgentCards';
import type { Gate, Artifact } from '@shared/types';
import './styles.css';

/**
 * Format a date as a relative timestamp (e.g., "2h ago", "1 day ago")
 */
function formatRelativeTime(date: Date | string | null): string {
  if (!date) return '';

  const now = new Date();
  const then = date instanceof Date ? date : new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;

  return then.toLocaleDateString();
}

function App() {
  const {
    isConnected,
    agents,
    projects,
    tasks,
    gates,
    artifacts,
    workspaces,
    latestCreatedProjectId,
    createProject,
    subscribeToProject,
    sendProjectMessage,
    addLocalMessage,
    resolveGate,
    createWorkspace,
    pauseAgent,
    resumeAgent,
    sendAgentMessage,
    getAgent,
  } = useWebSocket();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false);
  const [projectMode, setProjectMode] = useState<'manual' | 'linear'>('manual');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    // Load last-used workspace from localStorage
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('mandu-last-workspace-id');
      } catch {
        return null;
      }
    }
    return null;
  });
  const [linearIssueKey, setLinearIssueKey] = useState('');
  // Left Menu state - default to open on desktop
  const [isMenuOpen, setIsMenuOpen] = useState(() => {
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
  });

  // Left Menu handlers
  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  const toggleMenu = useCallback(() => setIsMenuOpen(prev => !prev), []);

  // Right Pane state - default to open on desktop, persisted via RightPane component
  const [isRightPaneOpen, setIsRightPaneOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    // Check localStorage for persisted state, default to true on desktop
    try {
      const stored = localStorage.getItem('mandu-right-pane-open');
      if (stored !== null) return JSON.parse(stored);
    } catch {
      // Ignore errors
    }
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  // Right Pane handlers
  const openRightPane = useCallback(() => setIsRightPaneOpen(true), []);
  const closeRightPane = useCallback(() => setIsRightPaneOpen(false), []);
  const toggleRightPane = useCallback(() => setIsRightPaneOpen((prev: boolean) => !prev), []);

  // Sort projects by lastActivityAt in descending order (newest first)
  const sortedProjects = useMemo(() =>
    [...projects].sort((a, b) => {
      const aTime = a.lastActivityAt || a.createdAt || new Date(0);
      const bTime = b.lastActivityAt || b.createdAt || new Date(0);
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    }),
    [projects]
  );

  // Auto-select first project
  useEffect(() => {
    if (sortedProjects.length > 0 && !selectedProjectId) {
      const firstProject = sortedProjects[0];
      setSelectedProjectId(firstProject.id);
      subscribeToProject(firstProject.id);
    }
  }, [sortedProjects, selectedProjectId, subscribeToProject]);

  // Auto-select newly created project
  useEffect(() => {
    if (latestCreatedProjectId) {
      setSelectedProjectId(latestCreatedProjectId);
      subscribeToProject(latestCreatedProjectId);
    }
  }, [latestCreatedProjectId, subscribeToProject]);

  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    subscribeToProject(projectId);
  }, [subscribeToProject]);

  const handleCreateProject = useCallback(() => {
    // Get cwd from selected workspace
    const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);
    const cwd = selectedWorkspace?.path || '/';

    // Save last-used workspace to localStorage
    if (selectedWorkspaceId) {
      try {
        localStorage.setItem('mandu-last-workspace-id', selectedWorkspaceId);
      } catch {
        // Ignore localStorage errors
      }
    }

    if (projectMode === 'linear') {
      if (linearIssueKey.trim()) {
        // For Linear mode, use issue key as name
        createProject(linearIssueKey.trim(), '', cwd, linearIssueKey.trim(), selectedWorkspaceId || undefined);
        setLinearIssueKey('');
        setProjectMode('manual');
        setShowNewProjectModal(false);
      }
    } else {
      if (newProjectName.trim()) {
        createProject(newProjectName.trim(), newProjectDesc.trim(), cwd, undefined, selectedWorkspaceId || undefined);
        setNewProjectName('');
        setNewProjectDesc('');
        setShowNewProjectModal(false);
      }
    }
  }, [createProject, projectMode, newProjectName, newProjectDesc, linearIssueKey, selectedWorkspaceId, workspaces]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  const projectGates = gates.filter(g => g.projectId === selectedProjectId);
  const projectArtifacts = artifacts.filter(a => a.projectId === selectedProjectId);
  const pendingGates = projectGates.filter(g => g.status === 'pending');

  return (
    <ThemeProvider>
      <ArtifactsProvider>
      <GatesProvider>
      <DiffsProvider projectId={selectedProjectId}>
      <div className="h-screen flex flex-row bg-bg-primary overflow-hidden">
        {/* Slide Menu with Sidebar Content */}
        <SlideMenu isOpen={isMenuOpen} onOpen={openMenu} onClose={closeMenu} onToggle={toggleMenu}>
          {/* Brand Header - compact top bar, matches main panel height */}
          <div className="h-[52px] px-3 flex items-center justify-between border-b border-border bg-gradient-to-r from-orange/5 to-transparent">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🥟</span>
              <h1 className="text-lg font-extrabold text-orange tracking-tight">Mandu</h1>
              {/* Connection indicator */}
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green animate-pulse' : 'bg-red'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
            </div>
            {/* Theme Toggle + Collapse Button */}
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                className="flex w-9 h-9 items-center justify-center rounded-lg border border-border text-text-muted hover:text-orange hover:border-orange/30 hover:bg-orange/5 transition-all"
                onClick={toggleMenu}
                aria-label="Close sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
          </div>

        {/* Projects Section Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Projects</span>
          <button
            className="
              w-7 h-7 rounded-lg bg-orange hover:bg-orange-dark active:scale-95
              text-white font-bold text-lg flex items-center justify-center
              transition-all duration-150 shadow-[0_2px_8px_rgba(255,140,66,0.3)]
              disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
            "
            onClick={() => setShowNewProjectModal(true)}
            disabled={!isConnected}
            aria-label="New project"
          >
            +
          </button>
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
          {sortedProjects.map((project) => {
            const projectPendingGates = gates.filter(
              g => g.projectId === project.id && g.status === 'pending'
            ).length;
            const isSelected = project.id === selectedProjectId;
            const relativeTime = formatRelativeTime(project.lastActivityAt || project.updatedAt);

            return (
              <button
                key={project.id}
                className={`
                  relative w-full text-left p-3.5 rounded-xl border transition-all duration-200
                  ${isSelected
                    ? 'bg-orange/10 border-orange/40 shadow-[0_0_20px_rgba(255,140,66,0.1)]'
                    : 'bg-bg-elevated border-border hover:border-orange/30 hover:bg-bg-hover'
                  }
                `}
                onClick={() => handleSelectProject(project.id)}
              >
                <div className={`font-semibold text-sm mb-1 truncate pr-8 ${isSelected ? 'text-orange' : 'text-text-primary'}`}>
                  {project.name}
                </div>
                <div className="text-xs text-text-muted truncate mb-2">
                  {project.description || 'No description'}
                </div>

                {/* Workspace name and last activity footer */}
                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  {project.workspaceName ? (
                    <span className="flex items-center gap-1 truncate max-w-[60%]">
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="truncate">{project.workspaceName}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  {relativeTime && (
                    <span className="flex-shrink-0 text-text-muted/70">
                      {relativeTime}
                    </span>
                  )}
                </div>

                {/* Pending Gates Badge */}
                {projectPendingGates > 0 && (
                  <div className="absolute top-2.5 right-2.5 bg-orange text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(255,140,66,0.3)]">
                    {projectPendingGates}
                  </div>
                )}
              </button>
            );
          })}

          {/* Empty State */}
          {sortedProjects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange/10 border border-orange/20 flex items-center justify-center text-3xl mb-4">
                📁
              </div>
              <p className="text-sm font-medium text-text-secondary mb-1">No projects yet</p>
              <p className="text-xs text-text-muted">Create one to get started!</p>
            </div>
          )}
        </div>

      </SlideMenu>

      {/* Main Panel - Center Pane with Artifact Viewer */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-bg-primary via-bg-primary to-[#8B5CF6]/[0.02]">
        {!selectedProject ? (
          /* Empty State - No Project Selected */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-24 h-24 rounded-3xl bg-orange/10 border border-orange/20 flex items-center justify-center text-5xl mb-6 shadow-[0_0_40px_rgba(255,140,66,0.15)]">
              🥟
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-3">Select a project to begin</h2>
            <p className="text-text-secondary max-w-md mb-6 leading-relaxed">
              Create a new project or select an existing one to start orchestrating your development workflow with your AI team.
            </p>
            <button
              className="
                bg-orange hover:bg-orange-dark active:scale-[0.98]
                text-white font-bold py-3.5 px-6 rounded-xl
                flex items-center gap-2
                transition-all duration-150 shadow-[0_4px_20px_rgba(255,140,66,0.3)]
                disabled:opacity-50 disabled:shadow-none
              "
              onClick={() => setShowNewProjectModal(true)}
              disabled={!isConnected}
            >
              <span className="text-lg">+</span>
              Create Your First Project
            </button>
          </div>
        ) : (
          /* Project Selected - Show CenterTopBar and Content */
          <CenterPaneContent
            artifacts={projectArtifacts}
            pendingGate={pendingGates[0]}
            resolveGate={resolveGate}
            addLocalMessage={addLocalMessage}
            projectId={selectedProject.id}
            projectGates={projectGates}
            isMenuOpen={isMenuOpen}
            onToggleMenu={toggleMenu}
            isRightPaneOpen={isRightPaneOpen}
            onToggleRightPane={toggleRightPane}
          />
        )}
      </main>

      {/* Right Pane - Agent Cards */}
      <RightPane
        isOpen={isRightPaneOpen}
        onOpen={openRightPane}
        onClose={closeRightPane}
        onToggle={toggleRightPane}
        minWidth={360}
        maxWidth={700}
        defaultWidth={480}
      >
        <AgentNavigationProvider>
          {/* Right Pane Header */}
          <div className="h-[52px] px-3 flex items-center justify-between border-b border-border bg-gradient-to-l from-orange/5 to-transparent flex-shrink-0">
            {/* Collapse Button - Left Side */}
            <button
              className="flex w-9 h-9 items-center justify-center rounded-lg border border-border text-text-muted hover:text-orange hover:border-orange/30 hover:bg-orange/5 transition-all"
              onClick={toggleRightPane}
              aria-label="Close team panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
            {/* Header Text - Right Aligned */}
            <div className="flex items-center gap-2">
              {selectedProject && (
                <span className="text-xs text-text-muted truncate max-w-[150px]">
                  {selectedProject.name} —
                </span>
              )}
              <h2 className="text-sm font-bold text-text-primary">Team</h2>
              <span className="text-lg">👥</span>
            </div>
          </div>

          {/* Agent Cards Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {selectedProject ? (
              <AgentCardsPane
                projectId={selectedProject.id}
                projectName={selectedProject.name}
                agents={agents}
                tasks={projectTasks}
                gates={projectGates}
                artifacts={projectArtifacts}
                isConnected={isConnected}
                onSendMessage={(message) => sendProjectMessage(selectedProject.id, message)}
                onPauseAgent={pauseAgent}
                onResumeAgent={resumeAgent}
                onSendAgentMessage={sendAgentMessage}
                onResolveGate={(gateId, status, comment) => {
                  resolveGate(gateId, status, comment);
                  const gate = projectGates.find(g => g.id === gateId);
                  const statusText = status === 'approved' ? '✅ Approved' : '↻ Requested changes on';
                  const message = `${statusText} gate: **${gate?.title}**${comment ? `\n\n> ${comment}` : ''}`;
                  addLocalMessage(selectedProject.id, message);
                }}
                getAgent={getAgent}
              />
            ) : (
              /* Empty state when no project selected */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 h-full">
                <div className="w-16 h-16 rounded-2xl bg-orange/10 border border-orange/20 flex items-center justify-center text-3xl mb-4 opacity-50">
                  👥
                </div>
                <p className="text-sm text-text-muted">Select a project to see your team</p>
              </div>
            )}
          </div>
        </AgentNavigationProvider>
      </RightPane>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-modal-fade"
          onClick={() => setShowNewProjectModal(false)}
        >
          <div
            className="bg-bg-elevated border border-border rounded-2xl w-full max-w-md shadow-modal animate-modal-slide overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-orange/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange/15 border border-orange/25 flex items-center justify-center text-xl">
                  🥟
                </div>
                <h2 className="text-lg font-bold text-text-primary">Create New Project</h2>
              </div>
              <button
                className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-all"
                onClick={() => setShowNewProjectModal(false)}
              >
                ×
              </button>
            </div>

            {/* Mode Toggle */}
            <div className="px-5 pt-5">
              <div className="flex bg-bg-primary rounded-xl p-1 border border-border">
                <button
                  className={`
                    flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all
                    ${projectMode === 'manual'
                      ? 'bg-orange/15 text-orange border border-orange/30'
                      : 'text-text-muted hover:text-text-primary'
                    }
                  `}
                  onClick={() => setProjectMode('manual')}
                >
                  From Scratch
                </button>
                <button
                  className={`
                    flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all
                    ${projectMode === 'linear'
                      ? 'bg-[#5E6AD2]/15 text-[#5E6AD2] border border-[#5E6AD2]/30'
                      : 'text-text-muted hover:text-text-primary'
                    }
                  `}
                  onClick={() => setProjectMode('linear')}
                >
                  From Linear
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-5">
              {projectMode === 'linear' ? (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-text-secondary">Linear Issue</label>
                    <input
                      type="text"
                      placeholder="e.g., MDU-1"
                      value={linearIssueKey}
                      onChange={(e) => setLinearIssueKey(e.target.value.toUpperCase())}
                      autoFocus
                      className="
                        w-full bg-bg-primary border border-border rounded-xl px-4 py-3
                        text-text-primary placeholder:text-text-muted font-mono
                        focus:outline-none focus:border-[#5E6AD2]/60 focus:ring-2 focus:ring-[#5E6AD2]/15
                        transition-all uppercase
                      "
                    />
                    <span className="text-xs text-text-muted">The EM will fetch issue details automatically</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-text-secondary">Project Name</label>
                    <input
                      type="text"
                      placeholder="e.g., User Authentication"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      autoFocus
                      className="
                        w-full bg-bg-primary border border-border rounded-xl px-4 py-3
                        text-text-primary placeholder:text-text-muted
                        focus:outline-none focus:border-orange/60 focus:ring-2 focus:ring-orange/15
                        transition-all
                      "
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-text-secondary">Description</label>
                    <textarea
                      placeholder="What do you want to build?"
                      value={newProjectDesc}
                      onChange={(e) => setNewProjectDesc(e.target.value)}
                      rows={3}
                      className="
                        w-full bg-bg-primary border border-border rounded-xl px-4 py-3
                        text-text-primary placeholder:text-text-muted
                        focus:outline-none focus:border-orange/60 focus:ring-2 focus:ring-orange/15
                        transition-all resize-none
                      "
                    />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-text-secondary">Workspace</label>
                <WorkspaceSelect
                  workspaces={workspaces}
                  selectedWorkspaceId={selectedWorkspaceId}
                  onSelect={setSelectedWorkspaceId}
                  onCreateNew={() => setShowCreateWorkspaceModal(true)}
                  accentColor={projectMode === 'linear' ? 'linear' : 'orange'}
                />
                <span className="text-xs text-text-muted">Where agents will operate on your codebase</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-border bg-bg-secondary/30">
              <button
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-text-secondary hover:bg-bg-hover transition-all"
                onClick={() => setShowNewProjectModal(false)}
              >
                Cancel
              </button>
              <button
                className={`
                  px-5 py-2.5 rounded-xl text-sm font-bold
                  active:scale-[0.98] text-white transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                  ${projectMode === 'linear'
                    ? 'bg-[#5E6AD2] hover:bg-[#4E5AC2] shadow-[0_2px_8px_rgba(94,106,210,0.25)]'
                    : 'bg-orange hover:bg-orange-dark shadow-[0_2px_8px_rgba(255,140,66,0.25)]'
                  }
                `}
                onClick={handleCreateProject}
                disabled={projectMode === 'linear' ? !linearIssueKey.trim() : !newProjectName.trim()}
              >
                {projectMode === 'linear' ? 'Create from Linear' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        isOpen={showCreateWorkspaceModal}
        onClose={() => setShowCreateWorkspaceModal(false)}
        onCreate={(name, path) => {
          createWorkspace(name, path);
          // The workspace will be added to the list when we receive the workspace_created message
          // For now, we can't auto-select it since we don't have the ID yet
        }}
        accentColor={projectMode === 'linear' ? 'linear' : 'orange'}
      />
      </div>
      </DiffsProvider>
      </GatesProvider>
      </ArtifactsProvider>
    </ThemeProvider>
  );
}

// Center Pane Content - Separate component to use artifacts context
interface CenterPaneContentProps {
  artifacts: Artifact[];
  pendingGate?: Gate;
  resolveGate: (gateId: string, status: 'approved' | 'rejected', comment?: string) => void;
  addLocalMessage: (projectId: string, message: string) => void;
  projectId: string;
  projectGates: Gate[];
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  isRightPaneOpen: boolean;
  onToggleRightPane: () => void;
}

function CenterPaneContent({
  artifacts,
  pendingGate,
  resolveGate,
  addLocalMessage,
  projectId,
  projectGates,
  isMenuOpen,
  onToggleMenu,
  isRightPaneOpen,
  onToggleRightPane,
}: CenterPaneContentProps) {
  const { selectedArtifact } = useArtifacts();
  const { selectedGate } = useGates();
  const { selectedDiff, diffs } = useDiffs();
  const [gateComment, setGateComment] = useState('');

  const handleResolveGate = (gateId: string, status: 'approved' | 'rejected', comment?: string) => {
    resolveGate(gateId, status, comment);
    const gate = projectGates.find(g => g.id === gateId);
    const statusText = status === 'approved' ? '✅ Approved' : '↻ Requested changes on';
    const message = `${statusText} gate: **${gate?.title}**${comment ? `\n\n> ${comment}` : ''}`;
    addLocalMessage(projectId, message);
    setGateComment('');
  };

  return (
    <>
      {/* Top Bar with Dropdown */}
      <CenterTopBar
        artifacts={artifacts}
        gates={projectGates}
        diffs={diffs}
        isMenuOpen={isMenuOpen}
        onToggleMenu={onToggleMenu}
        isRightPaneOpen={isRightPaneOpen}
        onToggleRightPane={onToggleRightPane}
      />

      {/* Main Content Area */}
      {selectedArtifact ? (
        <ArtifactViewer
          artifact={selectedArtifact}
          gate={pendingGate}
          gateComment={gateComment}
          onGateCommentChange={setGateComment}
          onResolveGate={handleResolveGate}
        />
      ) : selectedGate ? (
        <GateViewer
          gate={selectedGate}
          artifacts={artifacts}
          onResolve={handleResolveGate}
        />
      ) : selectedDiff ? (
        <GitDiffViewer
          diff={selectedDiff}
        />
      ) : (
        /* Empty state when no artifact, gate, or diff selected */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="flex gap-4 mb-5">
            <div className="w-16 h-16 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(139,92,246,0.1)]">
              📦
            </div>
            <div className="w-16 h-16 rounded-2xl bg-orange/10 border border-orange/20 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(255,140,66,0.1)]">
              🚧
            </div>
            <div className="w-16 h-16 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/20 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(16,185,129,0.1)]">
              ⎇
            </div>
          </div>
          {artifacts.length > 0 || projectGates.length > 0 || diffs.length > 0 ? (
            <>
              <h2 className="text-xl font-bold text-text-primary mb-2">Select an item</h2>
              <p className="text-text-secondary max-w-sm mb-4 text-sm">
                {artifacts.length > 0 && `Browse ${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''}`}
                {artifacts.length > 0 && (projectGates.length > 0 || diffs.length > 0) && ', '}
                {projectGates.length > 0 && `${projectGates.length} gate${projectGates.length !== 1 ? 's' : ''}`}
                {projectGates.length > 0 && diffs.length > 0 && ', or '}
                {diffs.length > 0 && `${diffs.length} diff${diffs.length !== 1 ? 's' : ''}`}
                {' '}from your project using the dropdowns above.
              </p>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className="px-2 py-1 rounded bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 text-[#A78BFA]">
                  Artifacts
                </span>
                <span className="px-2 py-1 rounded bg-orange/10 border border-orange/20 text-orange">
                  Gates
                </span>
                <span className="px-2 py-1 rounded bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
                  Diffs
                </span>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-text-primary mb-2">No artifacts, gates, or diffs yet</h2>
              <p className="text-text-secondary max-w-sm text-sm">
                Artifacts like specs, design docs, and code changes will appear here as your team works. Gates will appear when approval is needed. Diffs will show code changes for review.
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default App;
