import { useCallback, useState, useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { CollapsibleAgentCard } from './components/CollapsibleAgentCard';
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
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      const firstProject = projects[0];
      setSelectedProjectId(firstProject._id);
      subscribeToProject(firstProject._id);
    }
  }, [projects, selectedProjectId, subscribeToProject]);

  // Auto-expand EM agent when project is selected
  useEffect(() => {
    const selectedProject = projects.find(p => p._id === selectedProjectId);
    if (selectedProject?.emAgentId) {
      setExpandedAgents(prev => {
        const next = new Set(prev);
        next.add(selectedProject.emAgentId!);
        return next;
      });
    }
  }, [selectedProjectId, projects]);

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

  const toggleAgent = useCallback((agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  const selectedProject = projects.find(p => p._id === selectedProjectId);
  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  const projectGates = gates.filter(g => g.projectId === selectedProjectId);
  const projectArtifacts = artifacts.filter(a => a.projectId === selectedProjectId);
  const pendingGates = projectGates.filter(g => g.status === 'pending');

  // Get all agents for the selected project
  const projectAgents = useMemo(() => {
    if (!selectedProject) return [];

    console.log('[App] Computing projectAgents. All agents:', agents.map(a => a.id));
    console.log('[App] Project tasks:', projectTasks.map(t => ({ id: t._id, agentSessionId: t.agentSessionId, agent: t.assignedAgent })));

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

    // Also check all agents that match project task patterns (handles race condition)
    // Worker agents have IDs like "pm-{taskId}" or "developer-{taskId}"
    for (const agent of agents) {
      if (addedAgentIds.has(agent.id)) continue;

      // Check if agent ID matches pattern: {agentType}-{taskId}
      const match = agent.id.match(/^(pm|architect|developer|qa|reviewer)-(.+)$/);
      if (match) {
        const [, agentType, taskId] = match;
        console.log(`[App] Checking agent ${agent.id}: agentType=${agentType}, taskId=${taskId}`);
        // Check if this taskId belongs to this project
        const matchingTask = projectTasks.find(t => t._id === taskId);
        console.log(`[App] Matching task for ${taskId}:`, matchingTask ? 'FOUND' : 'NOT FOUND');
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

    console.log('[App] Final projectAgents:', result.map(r => ({ id: r.agent.id, type: r.type })));
    return result;
  }, [selectedProject, projectTasks, agents, getAgent]);

  return (
    <div className="app">
      {/* Sidebar - Projects */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="logo">🥟</span>
            <div className="brand-text">
              <h1>Mandu</h1>
              <span className="tagline">Your dev team. Wrapped in one.</span>
            </div>
          </div>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            <div className="connection-dot" />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        <div className="sidebar-section-header">
          <span>Projects</span>
          <span className="section-count">{projects.length}</span>
        </div>

        <div className="projects-list">
          {projects.map((project) => {
            const projectPendingGates = gates.filter(
              g => g.projectId === project._id && g.status === 'pending'
            ).length;

            return (
              <div
                key={project._id}
                className={`sidebar-project ${project._id === selectedProjectId ? 'selected' : ''}`}
                onClick={() => handleSelectProject(project._id)}
              >
                <div className="sidebar-project-name">{project.name}</div>
                <div className="sidebar-project-desc">
                  {project.description || 'No description'}
                </div>
                {projectPendingGates > 0 && (
                  <div className="pending-gates-badge">{projectPendingGates}</div>
                )}
              </div>
            );
          })}

          {projects.length === 0 && (
            <div className="empty-projects">
              <span className="empty-icon-small">📁</span>
              <p>No projects yet</p>
            </div>
          )}
        </div>

        <button
          className="add-agent-btn"
          onClick={() => setShowNewProjectModal(true)}
          disabled={!isConnected}
        >
          <span className="icon">+</span>
          New Project
        </button>

        {/* Task List for selected project */}
        {selectedProject && projectTasks.length > 0 && (
          <div className="task-list">
            <div className="task-list-header">
              <span>Tasks</span>
              <span className="section-count">{projectTasks.length}</span>
            </div>
            {projectTasks.slice(0, 5).map((task) => (
              <div key={task._id} className="task-item">
                <div className={`task-status ${task.status}`} />
                <div className="task-info">
                  <div className="task-title">{task.title}</div>
                  <div className="task-agent">{task.assignedAgent}</div>
                </div>
              </div>
            ))}
            {projectTasks.length > 5 && (
              <div className="task-overflow">+{projectTasks.length - 5} more</div>
            )}
          </div>
        )}
      </div>

      {/* Main Panel - Agent Cards */}
      <main className="main-panel">
        {selectedProject ? (
          <div className="agents-stack">
            <div className="agents-stack-header">
              <h2>{selectedProject.name}</h2>
              <span className="agents-count">{projectAgents.length} agent{projectAgents.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="agents-list-vertical">
              {projectAgents.length === 0 ? (
                <div className="empty-agents-state">
                  <span className="empty-icon">🥟</span>
                  <h3>Initializing agents...</h3>
                  <p>Your Engineering Manager is getting ready</p>
                </div>
              ) : (
                projectAgents.map(({ agent, type, isPrimary }) => (
                  <CollapsibleAgentCard
                    key={agent.id}
                    agent={agent}
                    agentType={type}
                    isExpanded={expandedAgents.has(agent.id)}
                    onToggle={() => toggleAgent(agent.id)}
                    onSendMessage={(message) => sendProjectMessage(selectedProject._id, message)}
                    isPrimary={isPrimary}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">🥟</span>
            <h2>Select a project to begin</h2>
            <p>Create a new project or select an existing one to start orchestrating your development workflow.</p>
            <button
              className="add-agent-btn"
              onClick={() => setShowNewProjectModal(true)}
              disabled={!isConnected}
              style={{ marginTop: '20px' }}
            >
              <span className="icon">+</span>
              Create Your First Project
            </button>
          </div>
        )}
      </main>

      {/* Right Panel - Gates */}
      {selectedProject && (
        <aside className="gates-panel">
          <div className="gates-header">
            <h2>Approval Gates</h2>
            {pendingGates.length > 0 && (
              <span className="pending-count">{pendingGates.length} pending</span>
            )}
          </div>

          <div className="gates-list">
            {projectGates.length === 0 ? (
              <div className="empty-gates">
                <span className="gate-empty-icon">🚧</span>
                <p>No gates yet</p>
                <span className="gate-empty-hint">Gates appear when work needs your approval</span>
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
        <div className="modal-overlay" onClick={() => setShowNewProjectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Project</h2>
              <button className="modal-close" onClick={() => setShowNewProjectModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  placeholder="e.g., User Authentication"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="What do you want to build?"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Working Directory</label>
                <input
                  type="text"
                  placeholder="/path/to/project"
                  value={newProjectCwd}
                  onChange={(e) => setNewProjectCwd(e.target.value)}
                />
                <span className="form-hint">Where agents will operate on your codebase</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowNewProjectModal(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
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
