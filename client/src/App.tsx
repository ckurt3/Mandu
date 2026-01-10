import { useCallback, useState, useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { AgentCard } from './components/AgentCard';
import { GateCard } from './components/GateCard';
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
    resolveGate,
    getAgent,
  } = useWebSocket();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectCwd, setNewProjectCwd] = useState('/');

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
    if (newProjectName.trim()) {
      createProject(newProjectName.trim(), newProjectDesc.trim(), newProjectCwd.trim() || '/');
      setNewProjectName('');
      setNewProjectDesc('');
      setShowNewProjectModal(false);
    }
  }, [createProject, newProjectName, newProjectDesc, newProjectCwd]);

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
    <div className="min-h-screen flex flex-row bg-bg-primary">
      {/* Sidebar - Projects */}
      <div className="w-[280px] min-w-[280px] bg-bg-secondary border-r border-border flex flex-col h-screen sticky top-0">
        {/* Brand Header */}
        <div className="p-5 border-b border-border bg-gradient-to-br from-orange/5 via-transparent to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange/15 border border-orange/25 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(255,140,66,0.1)]">
              🥟
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-orange tracking-tight">Mandu</h1>
            </div>
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

        {/* Task List for selected project */}
        {selectedProject && projectTasks.length > 0 && (
          <div className="border-t border-border p-3 max-h-[200px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Tasks</span>
              <span className="bg-bg-elevated text-text-secondary text-[11px] font-semibold px-2 py-0.5 rounded-md">
                {projectTasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              {projectTasks.slice(0, 5).map((task) => (
                <div
                  key={task._id}
                  className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-bg-hover/50 transition-colors"
                >
                  <div className={`
                    w-2 h-2 rounded-full flex-shrink-0
                    ${task.status === 'completed' ? 'bg-green' :
                      task.status === 'in_progress' ? 'bg-orange animate-pulse' :
                      task.status === 'cancelled' ? 'bg-red' : 'bg-text-muted'
                    }
                  `} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-text-primary truncate font-medium">{task.title}</div>
                    <div className="text-[11px] text-text-muted uppercase tracking-wide">{task.assignedAgent}</div>
                  </div>
                </div>
              ))}
            </div>

            {projectTasks.length > 5 && (
              <div className="text-[11px] text-text-muted text-center mt-2 py-1">
                +{projectTasks.length - 5} more tasks
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Panel - Agent Cards */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden bg-gradient-to-br from-bg-primary via-bg-primary to-orange/[0.02]">
        {selectedProject ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Project Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-bg-secondary/40 backdrop-blur-sm">
              <div>
                <h2 className="text-lg font-bold text-text-primary">{selectedProject.name}</h2>
                {selectedProject.description && (
                  <p className="text-sm text-text-muted mt-0.5">{selectedProject.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border">
                <span className="text-sm text-text-muted">
                  {projectAgents.length} agent{projectAgents.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Agent Cards */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-h-0">
              {projectAgents.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-orange/10 border border-orange/20 flex items-center justify-center text-4xl mb-5 animate-bounce-slow">
                    🥟
                  </div>
                  <h3 className="text-xl font-bold text-text-primary mb-2">Initializing agents...</h3>
                  <p className="text-text-muted max-w-sm">Your Engineering Manager is getting ready to orchestrate the team</p>
                </div>
              ) : (
                projectAgents.map(({ agent, type, isPrimary }) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    agentType={type}
                    onSendMessage={(message) => sendProjectMessage(selectedProject._id, message)}
                    isPrimary={isPrimary}
                  />
                ))
              )}
            </div>
          </div>
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

      {/* Right Panel - Gates */}
      {selectedProject && (
        <aside className="w-[360px] min-w-[360px] bg-bg-secondary border-l border-border flex flex-col h-screen">
          {/* Gates Header */}
          <div className="p-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-transparent to-orange/[0.03]">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚧</span>
              <h2 className="text-base font-bold text-text-primary">Approval Gates</h2>
            </div>
            {pendingGates.length > 0 && (
              <span className="
                bg-orange/15 text-orange text-xs font-bold px-2.5 py-1 rounded-lg
                border border-orange/25 animate-pulse
              ">
                {pendingGates.length} pending
              </span>
            )}
          </div>

          {/* Gates List */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {projectGates.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-bg-elevated border border-border flex items-center justify-center text-3xl mb-4">
                  🚧
                </div>
                <p className="text-sm font-medium text-text-secondary mb-1">No gates yet</p>
                <p className="text-xs text-text-muted max-w-[200px]">
                  Gates appear when work needs your review and approval
                </p>
              </div>
            ) : (
              projectGates.map((gate) => (
                <GateCard
                  key={gate._id}
                  gate={gate}
                  artifacts={projectArtifacts}
                  onResolve={resolveGate}
                />
              ))
            )}
          </div>
        </aside>
      )}

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

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-5">
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

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-text-secondary">Working Directory</label>
                <input
                  type="text"
                  placeholder="/path/to/project"
                  value={newProjectCwd}
                  onChange={(e) => setNewProjectCwd(e.target.value)}
                  className="
                    w-full bg-bg-primary border border-border rounded-xl px-4 py-3
                    text-text-primary placeholder:text-text-muted font-mono text-sm
                    focus:outline-none focus:border-orange/60 focus:ring-2 focus:ring-orange/15
                    transition-all
                  "
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
                className="
                  px-5 py-2.5 rounded-xl text-sm font-bold
                  bg-orange hover:bg-orange-dark active:scale-[0.98]
                  text-white transition-all shadow-[0_2px_8px_rgba(255,140,66,0.25)]
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                "
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
