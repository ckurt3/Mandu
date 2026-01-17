import { useCallback, useState, useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { TeamChat } from './components/TeamChat';
import { SlideMenu } from './components/SlideMenu';
import { RightPane } from './components/RightPane';
import { ThemeProvider } from './contexts/ThemeContext';
import { ArtifactsProvider, useArtifacts } from './contexts/ArtifactsContext';
import { ThemeToggle } from './components/ThemeToggle';
import { CenterTopBar, ArtifactViewer } from './components/CenterPane';
import type { AgentState, Gate, Artifact } from '@shared/types';
import './styles.css';

function App() {
  const {
    isConnected,
    agents,
    projects,
    tasks,
    gates,
    artifacts,
    createProject,
    subscribeToProject,
    sendProjectMessage,
    addLocalMessage,
    resolveGate,
    getAgent,
  } = useWebSocket();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [projectMode, setProjectMode] = useState<'manual' | 'linear'>('manual');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectCwd, setNewProjectCwd] = useState('');
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
  const toggleRightPane = useCallback(() => setIsRightPaneOpen(prev => !prev), []);

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      const firstProject = projects[0];
      setSelectedProjectId(firstProject.id);
      subscribeToProject(firstProject.id);
    }
  }, [projects, selectedProjectId, subscribeToProject]);

  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    subscribeToProject(projectId);
  }, [subscribeToProject]);

  const handleCreateProject = useCallback(() => {
    const cwd = newProjectCwd.trim() || '/';

    if (projectMode === 'linear') {
      if (linearIssueKey.trim()) {
        // For Linear mode, use issue key as name
        createProject(linearIssueKey.trim(), '', cwd, linearIssueKey.trim());
        setLinearIssueKey('');
        setNewProjectCwd('/');
        setProjectMode('manual');
        setShowNewProjectModal(false);
      }
    } else {
      if (newProjectName.trim()) {
        createProject(newProjectName.trim(), newProjectDesc.trim(), cwd);
        setNewProjectName('');
        setNewProjectDesc('');
        setNewProjectCwd('/');
        setShowNewProjectModal(false);
      }
    }
  }, [createProject, projectMode, newProjectName, newProjectDesc, newProjectCwd, linearIssueKey]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  const projectGates = gates.filter(g => g.projectId === selectedProjectId);
  const projectArtifacts = artifacts.filter(a => a.projectId === selectedProjectId);
  const pendingGates = projectGates.filter(g => g.status === 'pending');

  // Get all agents for the selected project
  const projectAgents = useMemo(() => {
    if (!selectedProject) return [];

    const result: Array<{ agent: AgentState; type: string; isPrimary: boolean }> = [];
    const addedAgentIds = new Set<string>();

    // Add EM agent first (primary) - EM agent ID is always `em-${projectId}`
    const emAgentId = `em-${selectedProject.id}`;
    const emAgent = getAgent(emAgentId) || {
      id: emAgentId,
      status: 'idle' as const,
      messages: [],
    };
    result.push({ agent: emAgent, type: 'em', isPrimary: true });
    addedAgentIds.add(emAgentId);

    // Add worker agents from tasks - worker agent ID is `${agentType}-${taskId}`
    for (const task of projectTasks) {
      if (task.agentType && task.agentType !== 'em') {
        const workerAgentId = `${task.agentType}-${task.id}`;
        if (!addedAgentIds.has(workerAgentId)) {
          const agent = getAgent(workerAgentId);
          if (agent) {
            result.push({
              agent,
              type: task.agentType,
              isPrimary: false,
            });
            addedAgentIds.add(workerAgentId);
          }
        }
      }
    }

    // Also check all agents that match project task patterns
    for (const agent of agents) {
      if (addedAgentIds.has(agent.id)) continue;

      const match = agent.id.match(/^(pm|architect|developer|qa|reviewer)-(.+)$/);
      if (match) {
        const [, agentType, taskId] = match;
        const matchingTask = projectTasks.find(t => t.id === taskId);
        if (matchingTask) {
          result.push({
            agent,
            type: agentType,
            isPrimary: false,
          });
          addedAgentIds.add(agent.id);
        }
      }
    }

    return result;
  }, [selectedProject, projectTasks, agents, getAgent]);

  return (
    <ThemeProvider>
      <ArtifactsProvider>
      <div className="h-screen flex flex-row bg-bg-primary overflow-hidden">
        {/* Desktop expand button - visible when sidebar is collapsed */}
        <button
          className={`
            hidden lg:flex fixed top-3 left-3 z-30
            w-9 h-9 items-center justify-center
            rounded-lg border border-border
            text-text-muted hover:text-orange hover:border-orange/30 hover:bg-orange/5
            transition-all duration-300
            ${isMenuOpen ? 'opacity-0 pointer-events-none -translate-x-2' : 'opacity-100 translate-x-0'}
          `}
          onClick={toggleMenu}
          aria-label="Expand sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

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
          {projects.map((project) => {
            const projectPendingGates = gates.filter(
              g => g.projectId === project.id && g.status === 'pending'
            ).length;
            const isSelected = project.id === selectedProjectId;

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
                <div className={`font-semibold text-sm mb-1 truncate ${isSelected ? 'text-orange' : 'text-text-primary'}`}>
                  {project.name}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {project.description || 'No description'}
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
          {projects.length === 0 && (
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
            projectName={selectedProject.name}
            pendingGate={pendingGates[0]}
            resolveGate={resolveGate}
            addLocalMessage={addLocalMessage}
            projectId={selectedProject.id}
            projectGates={projectGates}
          />
        )}
      </main>

      {/* Right Pane - Team Chat */}
      <RightPane
        isOpen={isRightPaneOpen}
        onOpen={openRightPane}
        onClose={closeRightPane}
        onToggle={toggleRightPane}
        minWidth={360}
        maxWidth={700}
        defaultWidth={480}
      >
        {/* Right Pane Header */}
        <div className="h-[52px] px-3 flex items-center justify-between border-b border-border bg-gradient-to-l from-orange/5 to-transparent flex-shrink-0">
          {/* Collapse Button - Left Side */}
          <button
            className="flex w-9 h-9 items-center justify-center rounded-lg border border-border text-text-muted hover:text-orange hover:border-orange/30 hover:bg-orange/5 transition-all"
            onClick={toggleRightPane}
            aria-label="Close chat panel"
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
            <h2 className="text-sm font-bold text-text-primary">Team Chat</h2>
            <span className="text-lg">💬</span>
          </div>
        </div>

        {/* Team Chat Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {selectedProject ? (
            <TeamChat
              agents={projectAgents.map(({ agent, type }) => ({ agent, type }))}
              onSendMessage={(message) => sendProjectMessage(selectedProject.id, message)}
              projectName={selectedProject.name}
              projectId={selectedProject.id}
              gates={projectGates}
              artifacts={projectArtifacts}
              isConnected={isConnected}
              onResolveGate={(gateId, status, comment) => {
                resolveGate(gateId, status, comment);
                const gate = projectGates.find(g => g.id === gateId);
                const statusText = status === 'approved' ? '✅ Approved' : '↻ Requested changes on';
                const message = `${statusText} gate: **${gate?.title}**${comment ? `\n\n> ${comment}` : ''}`;
                addLocalMessage(selectedProject.id, message);
              }}
            />
          ) : (
            /* Empty state when no project selected */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 h-full">
              <div className="w-16 h-16 rounded-2xl bg-orange/10 border border-orange/20 flex items-center justify-center text-3xl mb-4 opacity-50">
                💬
              </div>
              <p className="text-sm text-text-muted">Select a project to start chatting</p>
            </div>
          )}
        </div>
      </RightPane>

      {/* Desktop expand button - visible when right pane is collapsed */}
      <button
        className={`
          hidden lg:flex fixed top-3 right-3 z-30
          w-9 h-9 items-center justify-center
          rounded-lg border border-border
          text-text-muted hover:text-orange hover:border-orange/30 hover:bg-orange/5
          transition-all duration-300
          ${isRightPaneOpen ? 'opacity-0 pointer-events-none translate-x-2' : 'opacity-100 translate-x-0'}
        `}
        onClick={toggleRightPane}
        aria-label="Expand chat panel"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

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
                <label className="text-sm font-semibold text-text-secondary">Working Directory</label>
                <input
                  type="text"
                  placeholder="/path/to/project"
                  value={newProjectCwd}
                  onChange={(e) => setNewProjectCwd(e.target.value)}
                  className={`
                    w-full bg-bg-primary border border-border rounded-xl px-4 py-3
                    text-text-primary placeholder:text-text-muted font-mono text-sm
                    focus:outline-none transition-all
                    ${projectMode === 'linear'
                      ? 'focus:border-[#5E6AD2]/60 focus:ring-2 focus:ring-[#5E6AD2]/15'
                      : 'focus:border-orange/60 focus:ring-2 focus:ring-orange/15'
                    }
                  `}
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
      </div>
      </ArtifactsProvider>
    </ThemeProvider>
  );
}

// Center Pane Content - Separate component to use artifacts context
interface CenterPaneContentProps {
  artifacts: Artifact[];
  projectName: string;
  pendingGate?: Gate;
  resolveGate: (gateId: string, status: 'approved' | 'rejected', comment?: string) => void;
  addLocalMessage: (projectId: string, message: string) => void;
  projectId: string;
  projectGates: Gate[];
}

function CenterPaneContent({
  artifacts,
  projectName,
  pendingGate,
  resolveGate,
  addLocalMessage,
  projectId,
  projectGates,
}: CenterPaneContentProps) {
  const { selectedArtifact } = useArtifacts();
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
        projectName={projectName}
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
      ) : (
        /* Empty state when no artifact selected */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-20 h-20 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center text-4xl mb-5 shadow-[0_0_30px_rgba(139,92,246,0.1)]">
            📦
          </div>
          {artifacts.length > 0 ? (
            <>
              <h2 className="text-xl font-bold text-text-primary mb-2">Select an artifact</h2>
              <p className="text-text-secondary max-w-sm mb-4 text-sm">
                Click the Artifacts dropdown above to browse {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''} from your project.
              </p>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className="px-2 py-1 rounded bg-bg-secondary border border-border">
                  Specs, Designs, Code Changes, Tests
                </span>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-text-primary mb-2">No artifacts yet</h2>
              <p className="text-text-secondary max-w-sm text-sm">
                Artifacts like specs, design docs, and code changes will appear here as your team works on the project.
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default App;
