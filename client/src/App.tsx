import { useCallback, useState, useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { TeamChat } from './components/TeamChat';
import { SlideMenu } from './components/SlideMenu';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';
import type { AgentState } from './types';
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
  const [newProjectCwd, setNewProjectCwd] = useState('/');
  const [linearIssueKey, setLinearIssueKey] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Menu handlers
  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      const firstProject = projects[0];
      setSelectedProjectId(firstProject._id);
      subscribeToProject(firstProject._id);
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

  const selectedProject = projects.find(p => p._id === selectedProjectId);
  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  const projectGates = gates.filter(g => g.projectId === selectedProjectId);
  const projectArtifacts = artifacts.filter(a => a.projectId === selectedProjectId);
  const pendingGates = projectGates.filter(g => g.status === 'pending');

  // Get all agents for the selected project
  const projectAgents = useMemo(() => {
    if (!selectedProject) return [];

    const result: Array<{ agent: AgentState; type: string; isPrimary: boolean }> = [];
    const addedAgentIds = new Set<string>();

    // Add EM agent first (primary)
    if (selectedProject.emAgentId) {
      const emAgent = getAgent(selectedProject.emAgentId) || {
        id: selectedProject.emAgentId,
        status: 'idle' as const,
        messages: [],
      };
      result.push({ agent: emAgent, type: 'em', isPrimary: true });
      addedAgentIds.add(selectedProject.emAgentId);
    }

    // Add worker agents from tasks (by agentSessionId)
    for (const task of projectTasks) {
      if (task.agentSessionId && task.assignedAgent !== 'em' && !addedAgentIds.has(task.agentSessionId)) {
        const agent = getAgent(task.agentSessionId);
        if (agent) {
          result.push({
            agent,
            type: task.assignedAgent,
            isPrimary: false,
          });
          addedAgentIds.add(task.agentSessionId);
        }
      }
    }

    // Also check all agents that match project task patterns
    for (const agent of agents) {
      if (addedAgentIds.has(agent.id)) continue;

      const match = agent.id.match(/^(pm|architect|developer|qa|reviewer)-(.+)$/);
      if (match) {
        const [, agentType, taskId] = match;
        const matchingTask = projectTasks.find(t => t._id === taskId);
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
      <div className="h-screen flex flex-row bg-bg-primary overflow-hidden">
        {/* Slide Menu with Sidebar Content */}
        <SlideMenu isOpen={isMenuOpen} onOpen={openMenu} onClose={closeMenu}>
          {/* Brand Header */}
          <div className="p-5 border-b border-border bg-gradient-to-br from-orange/5 via-transparent to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-orange/15 border border-orange/25 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(255,140,66,0.1)]">
                  🥟
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-orange tracking-tight">Mandu</h1>
                </div>
              </div>
              {/* Theme Toggle */}
              <ThemeToggle />
            </div>

          {/* Connection Status */}
          <div className={`
            flex items-center gap-2 mt-4 px-2.5 py-1.5 rounded-lg text-xs font-semibold
            ${isConnected
              ? 'bg-green/10 text-green border border-green/20'
              : 'bg-red/10 text-red border border-red/20'
            }
          `}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green animate-pulse' : 'bg-red'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        {/* Projects Section Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Projects</span>
          <span className="bg-orange/10 text-orange text-[11px] font-bold px-2 py-0.5 rounded-md border border-orange/20">
            {projects.length}
          </span>
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
          {projects.map((project) => {
            const projectPendingGates = gates.filter(
              g => g.projectId === project._id && g.status === 'pending'
            ).length;
            const isSelected = project._id === selectedProjectId;

            return (
              <button
                key={project._id}
                className={`
                  relative w-full text-left p-3.5 rounded-xl border transition-all duration-200
                  ${isSelected
                    ? 'bg-orange/10 border-orange/40 shadow-[0_0_20px_rgba(255,140,66,0.1)]'
                    : 'bg-bg-elevated border-border hover:border-orange/30 hover:bg-bg-hover'
                  }
                `}
                onClick={() => handleSelectProject(project._id)}
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

        {/* New Project Button */}
        <div className="p-3 border-t border-border">
          <button
            className="
              w-full bg-orange hover:bg-orange-dark active:scale-[0.98]
              text-white font-bold py-3.5 px-4 rounded-xl
              flex items-center justify-center gap-2
              transition-all duration-150 shadow-[0_4px_12px_rgba(255,140,66,0.25)]
              disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
            "
            onClick={() => setShowNewProjectModal(true)}
            disabled={!isConnected}
          >
            <span className="text-lg">+</span>
            New Project
          </button>
        </div>
      </SlideMenu>

      {/* Main Panel - Team Chat */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-bg-primary via-bg-primary to-orange/[0.02]">
        {selectedProject ? (
          <TeamChat
            agents={projectAgents.map(({ agent, type }) => ({ agent, type }))}
            onSendMessage={(message) => sendProjectMessage(selectedProject._id, message)}
            projectName={selectedProject.name}
            gates={projectGates}
            artifacts={projectArtifacts}
            onResolveGate={(gateId, status, comment) => {
              resolveGate(gateId, status, comment);
              const gate = projectGates.find(g => g._id === gateId);
              const statusText = status === 'approved' ? '✅ Approved' : '↻ Requested changes on';
              const message = `${statusText} gate: **${gate?.title}**${comment ? `\n\n> ${comment}` : ''}`;
              addLocalMessage(selectedProject._id, message);
            }}
          />
        ) : (
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
        )}
      </main>

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
    </ThemeProvider>
  );
}

export default App;
