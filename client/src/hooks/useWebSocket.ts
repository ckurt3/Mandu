import { useEffect, useRef, useState, useCallback } from 'react';
import type { AgentState, ServerMessage, ChatMessage, Project, Task, Gate, Artifact, Workspace, MessagePayload, AgentMessageMessage, GateResolvedMessage, TodoItem, AgentPausedMessage, AgentResumedMessage, AgentTodoUpdateMessage } from '@shared/types';

// Extended agent state with pause/todo info
export interface ExtendedAgentState extends AgentState {
  isPaused?: boolean;
  todos?: TodoItem[];
  queuedMessages?: string[];
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [agents, setAgents] = useState<Map<string, ExtendedAgentState>>(new Map());
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [subscribedProjectId, setSubscribedProjectId] = useState<string | null>(null);
  const [latestCreatedProjectId, setLatestCreatedProjectId] = useState<string | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Dev server (5173) connects to dev backend (3001), prod (3000) connects to itself
    const wsPort = window.location.port === '5173' ? '3001' : '3000';
    const wsUrl = `${protocol}//${window.location.hostname}:${wsPort}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
      // Request project list and workspaces on connect
      ws.send(JSON.stringify({ type: 'list_projects' }));
      ws.send(JSON.stringify({ type: 'list_workspaces' }));
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      // Project messages
      case 'projects_list':
        if (message.projects) {
          setProjects(message.projects.map(p => ({
            id: p._id,
            name: p.name,
            description: p.description,
            cwd: null,
            workspaceId: (p as { workspaceId?: string }).workspaceId || null,
            workspaceName: (p as { workspaceName?: string }).workspaceName || null,
            status: p.status,
            createdAt: null,
            updatedAt: null,
            lastActivityAt: (p as { lastActivityAt?: Date }).lastActivityAt || null,
          })));
        }
        break;

      case 'project_created':
        if (message.projectId && message.name) {
          setProjects(prev => {
            // Check if already exists
            if (prev.some(p => p.id === message.projectId)) {
              return prev;
            }
            const newProject: Project = {
              id: message.projectId!,
              name: message.name!,
              description: message.description || null,
              cwd: null,
              workspaceId: (message as { workspaceId?: string }).workspaceId || null,
              workspaceName: (message as { workspaceName?: string }).workspaceName || null,
              status: 'running',
              createdAt: new Date(),
              updatedAt: new Date(),
              lastActivityAt: new Date(),
            };
            return [...prev, newProject];
          });
          // Track newly created project for auto-selection
          setLatestCreatedProjectId(message.projectId!);
        }
        break;

      case 'project_subscribed': {
        const projectId = message.projectId || null;
        setSubscribedProjectId(projectId);

        // Set gates from the subscribed message
        if (message.pendingGates) {
          setGates(message.pendingGates);
        }
        // Load artifacts from subscription (persisted)
        if (message.artifacts) {
          setArtifacts(message.artifacts);
        } else {
          setArtifacts([]);
        }
        // Load tasks from subscription (persisted)
        if (message.tasks) {
          setTasks(message.tasks);
        } else {
          setTasks([]);
        }

        // Process timeline events to restore chat history
        // The timeline contains all broadcast events in order - replay them
        if (message.timeline && message.timeline.length > 0) {
          // Process each timeline event through the message handlers
          // We need to handle this specially since subscribedProjectId isn't set yet in closure
          for (const event of message.timeline) {
            // Skip project_subscribed to avoid infinite recursion
            if (event.type === 'project_subscribed') continue;

            // Handle each event type inline to avoid closure issues with subscribedProjectId
            switch (event.type) {
              case 'agent_message': {
                const evt = event as AgentMessageMessage;

                // Handle user messages
                if (evt.isUserMessage) {
                  const emAgentId = `em-${evt.projectId || projectId}`;
                  setAgents(prev => {
                    const updated = new Map(prev);
                    let agent = updated.get(emAgentId);
                    if (!agent) {
                      agent = { id: emAgentId, status: 'idle', messages: [] };
                    }
                    const userMessage: ChatMessage = {
                      id: `timeline-${Date.now()}-${Math.random()}`,
                      role: 'user',
                      content: evt.message!,
                      timestamp: Date.now(),
                    };
                    updated.set(emAgentId, {
                      ...agent,
                      messages: [...agent.messages, userMessage],
                    });
                    return updated;
                  });
                  break;
                }

                // EM uses projectId, workers use taskId
                const agentId = evt.taskId
                  ? `${evt.agentType}-${evt.taskId}`
                  : `em-${evt.projectId || projectId}`;

                // Handle text messages (skip partial messages during replay)
                if (evt.message !== undefined && !evt.isPartial) {
                  setAgents(prev => {
                    const updated = new Map(prev);
                    let agent = updated.get(agentId);
                    if (!agent) {
                      agent = { id: agentId, status: 'idle', messages: [] };
                    }
                    const newMessage: ChatMessage = {
                      id: `timeline-${Date.now()}-${Math.random()}`,
                      role: 'assistant',
                      content: evt.message!,
                      timestamp: Date.now(),
                      agentType: evt.agentType,
                    };
                    updated.set(agentId, {
                      ...agent,
                      messages: [...agent.messages, newMessage],
                    });
                    return updated;
                  });
                }

                // Handle tool use messages
                if (evt.toolName) {
                  setAgents(prev => {
                    const updated = new Map(prev);
                    let agent = updated.get(agentId);
                    if (!agent) {
                      agent = { id: agentId, status: 'idle', messages: [] };
                    }
                    const toolMessage: ChatMessage = {
                      id: evt.toolUseId || `timeline-${Date.now()}-${Math.random()}`,
                      role: 'tool',
                      content: '',
                      toolName: evt.toolName,
                      toolInput: evt.toolInput,
                      timestamp: Date.now(),
                      agentType: evt.agentType,
                    };
                    updated.set(agentId, {
                      ...agent,
                      messages: [...agent.messages, toolMessage],
                    });
                    return updated;
                  });
                }

                // Handle tool result messages
                if (evt.toolResult !== undefined && evt.toolUseId) {
                  setAgents(prev => {
                    const updated = new Map(prev);
                    const agent = updated.get(agentId);
                    if (!agent) return prev;

                    const messages = agent.messages.map(msg => {
                      if (msg.id === evt.toolUseId && msg.role === 'tool') {
                        return { ...msg, toolResult: evt.toolResult, isToolResult: true };
                      }
                      return msg;
                    });

                    updated.set(agentId, { ...agent, messages });
                    return updated;
                  });
                }
                break;
              }

              case 'gate_resolved': {
                const evt = event as GateResolvedMessage;
                setGates(prev => prev.map(g =>
                  g.id === evt.gateId
                    ? { ...g, status: evt.status as 'approved' | 'rejected', resolvedAt: new Date() }
                    : g
                ));
                break;
              }

              // Other event types are already handled via tasks/gates/artifacts arrays
              // or don't need replay (project_status, task_started, etc.)
            }
          }
        }
        break;
      }

      case 'project_status':
        if (message.projectId) {
          setProjects(prev => prev.map(p =>
            p.id === message.projectId
              ? { ...p, status: message.status }
              : p
          ));

          // Update EM agent status when project completes or fails
          if (message.status === 'completed' || message.status === 'failed') {
            const emAgentId = `em-${message.projectId}`;
            setAgents(prev => {
              const updated = new Map(prev);
              const agent = updated.get(emAgentId);
              if (agent) {
                updated.set(emAgentId, {
                  ...agent,
                  status: message.status === 'failed' ? 'error' : 'idle'
                });
              }
              return updated;
            });
          }
        }
        break;

      case 'task_started':
        if (message.taskId) {
          setTasks(prev => [...prev, {
            id: message.taskId,
            projectId: message.projectId,
            agentType: message.agentType,
            title: `Task for ${message.agentType}`,
            input: null,
            output: null,
            status: 'running',
            error: null,
            attempts: 0,
            createdAt: new Date(),
            completedAt: null,
          }]);
        }
        break;

      case 'em_waiting': {
        // EM has delegated to a worker and is now waiting
        const emAgentId = `em-${message.projectId || subscribedProjectId}`;
        setAgents(prev => {
          const updated = new Map(prev);
          const agent = updated.get(emAgentId);
          if (agent) {
            updated.set(emAgentId, { ...agent, status: 'idle' });
          }
          return updated;
        });
        break;
      }

      case 'task_completed':
        if (message.taskId) {
          setTasks(prev => prev.map(t =>
            t.id === message.taskId
              ? { ...t, status: 'completed', completedAt: new Date() }
              : t
          ));
          // Update agent status to idle
          if (message.agentType) {
            const agentId = `${message.agentType}-${message.taskId}`;
            setAgents(prev => {
              const updated = new Map(prev);
              const agent = updated.get(agentId);
              if (agent) {
                updated.set(agentId, { ...agent, status: 'idle' });
              }
              return updated;
            });
          }
        }
        break;

      case 'task_failed':
        if (message.taskId) {
          setTasks(prev => prev.map(t =>
            t.id === message.taskId
              ? { ...t, status: 'failed', error: message.error || 'Unknown error' }
              : t
          ));
          // Update agent status to error
          if (message.agentType) {
            const agentId = `${message.agentType}-${message.taskId}`;
            setAgents(prev => {
              const updated = new Map(prev);
              const agent = updated.get(agentId);
              if (agent) {
                updated.set(agentId, { ...agent, status: 'error' });
              }
              return updated;
            });
          }
        }
        break;

      case 'gate_created':
        if (message.gate) {
          setGates(prev => [...prev, {
            id: message.gate.id,
            projectId: message.projectId,
            type: message.gate.type,
            title: message.gate.title,
            description: message.gate.description || null,
            status: 'pending',
            requestedAt: new Date(),
            resolvedAt: null,
            resolvedBy: null,
            resolution: null,
          }]);
          // Set EM to idle while waiting for gate approval
          const emAgentId = `em-${subscribedProjectId}`;
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(emAgentId);
            if (agent) {
              updated.set(emAgentId, { ...agent, status: 'idle' });
            }
            return updated;
          });
        }
        break;

      case 'gate_resolved':
        if (message.gateId) {
          setGates(prev => prev.map(g =>
            g.id === message.gateId
              ? { ...g, status: message.status as 'approved' | 'rejected', resolvedAt: new Date() }
              : g
          ));
        }
        break;

      case 'artifact_created':
        if (message.artifact) {
          setArtifacts(prev => [...prev, {
            id: message.artifact.id,
            projectId: message.projectId,
            taskId: null,
            type: message.artifact.type,
            title: message.artifact.title,
            content: null,
            filePath: null,
            metadata: null,
            createdAt: new Date(),
          }]);
        }
        break;

      // Agent messages - for real-time streaming
      case 'agent_message': {
        // Handle initial user messages from project creation
        if (message.isUserMessage) {
          const emAgentId = `em-${message.projectId || subscribedProjectId}`;
          setAgents(prev => {
            const updated = new Map(prev);
            let agent = updated.get(emAgentId);
            if (!agent) {
              agent = { id: emAgentId, status: 'thinking', messages: [] };
            }
            const userMessage: ChatMessage = {
              id: `${Date.now()}-user-init`,
              role: 'user',
              content: message.message!,
              timestamp: Date.now(),
            };
            updated.set(emAgentId, {
              ...agent,
              status: 'thinking',
              messages: [...agent.messages, userMessage],
            });
            return updated;
          });
          break;
        }

        // EM uses projectId, workers use taskId
        const agentId = message.taskId
          ? `${message.agentType}-${message.taskId}`
          : `em-${message.projectId || subscribedProjectId}`;

        // Handle text messages
        if (message.message !== undefined) {
          setAgents(prev => {
            const updated = new Map(prev);
            let agent = updated.get(agentId);
            if (!agent) {
              agent = { id: agentId, status: 'thinking', messages: [] };
            }
            const newMessage: ChatMessage = {
              id: `${Date.now()}-${Math.random()}`,
              role: 'assistant',
              content: message.message!,
              isPartial: message.isPartial,
              timestamp: Date.now(),
              agentType: message.agentType,
            };
            const messages = [...agent.messages];
            if (messages.length > 0 && messages[messages.length - 1].isPartial) {
              messages[messages.length - 1] = newMessage;
            } else {
              messages.push(newMessage);
            }
            // Set status to thinking when agent is actively sending messages
            updated.set(agentId, { ...agent, status: 'thinking', messages });
            return updated;
          });
        }

        // Handle tool use messages
        if (message.toolName) {
          setAgents(prev => {
            const updated = new Map(prev);
            let agent = updated.get(agentId);
            if (!agent) {
              agent = { id: agentId, status: 'thinking', messages: [] };
            }
            // Use toolUseId as the message id for matching results later
            const toolMessage: ChatMessage = {
              id: (message as { toolUseId?: string }).toolUseId || `${Date.now()}-${Math.random()}`,
              role: 'tool',
              content: '',
              toolName: message.toolName,
              toolInput: message.toolInput,
              timestamp: Date.now(),
              agentType: message.agentType,
            };
            // Set status to thinking when agent is using tools
            updated.set(agentId, {
              ...agent,
              status: 'thinking',
              messages: [...agent.messages, toolMessage],
            });
            return updated;
          });
        }

        // Handle tool result messages (update existing tool message with result)
        if ((message as { toolResult?: string }).toolResult !== undefined && (message as { toolUseId?: string }).toolUseId) {
          const toolUseId = (message as { toolUseId?: string }).toolUseId!;
          const toolResult = (message as { toolResult?: string }).toolResult!;

          setAgents(prev => {
            const updated = new Map(prev);
            let agent = updated.get(agentId);
            if (!agent) return prev;

            // Find and update the matching tool message
            const messages = agent.messages.map(msg => {
              if (msg.id === toolUseId && msg.role === 'tool') {
                return { ...msg, toolResult, isToolResult: true };
              }
              return msg;
            });

            updated.set(agentId, { ...agent, messages });
            return updated;
          });
        }
        break;
      }

      // Workspace messages
      case 'workspaces_list':
        if ((message as { workspaces?: Workspace[] }).workspaces) {
          setWorkspaces((message as { workspaces: Workspace[] }).workspaces);
        }
        break;

      case 'workspace_created':
        if ((message as { workspace?: Workspace }).workspace) {
          const newWorkspace = (message as { workspace: Workspace }).workspace;
          setWorkspaces(prev => {
            // Check if already exists
            if (prev.some(w => w.id === newWorkspace.id)) {
              return prev;
            }
            return [...prev, newWorkspace];
          });
        }
        break;

      case 'workspace_deleted':
        if ((message as { workspaceId?: string }).workspaceId) {
          const workspaceId = (message as { workspaceId: string }).workspaceId;
          setWorkspaces(prev => prev.filter(w => w.id !== workspaceId));
        }
        break;

      case 'workspace_error':
        // Workspace errors are logged for now, could be surfaced to UI
        console.error('Workspace error:', (message as { error?: string }).error);
        break;

      // Agent control messages
      case 'agent_paused': {
        const evt = message as AgentPausedMessage;
        // Build agent ID - for EM it's em-{projectId}, for workers it's {agentType}-{taskId}
        // The taskId in the message is actually the task-specific ID
        const task = tasks.find(t => t.id === evt.taskId);
        const agentId = task
          ? `${task.agentType}-${evt.taskId}`
          : `em-${evt.projectId}`;

        setAgents(prev => {
          const updated = new Map(prev);
          const agent = updated.get(agentId);
          if (agent) {
            updated.set(agentId, { ...agent, isPaused: true, status: 'idle' });
          }
          return updated;
        });
        break;
      }

      case 'agent_resumed': {
        const evt = message as AgentResumedMessage;
        const task = tasks.find(t => t.id === evt.taskId);
        const agentId = task
          ? `${task.agentType}-${evt.taskId}`
          : `em-${evt.projectId}`;

        setAgents(prev => {
          const updated = new Map(prev);
          const agent = updated.get(agentId);
          if (agent) {
            updated.set(agentId, {
              ...agent,
              isPaused: false,
              status: 'thinking',
              queuedMessages: [] // Clear queued messages on resume
            });
          }
          return updated;
        });
        break;
      }

      case 'agent_todo_update': {
        const evt = message as AgentTodoUpdateMessage;
        const agentId = evt.taskId
          ? `${evt.agentType}-${evt.taskId}`
          : `em-${evt.projectId}`;

        setAgents(prev => {
          const updated = new Map(prev);
          let agent = updated.get(agentId);
          if (!agent) {
            agent = { id: agentId, status: 'thinking', messages: [], todos: [] };
          }
          updated.set(agentId, { ...agent, todos: evt.todos });
          return updated;
        });
        break;
      }
    }
  }, [subscribedProjectId, tasks]);

  // Project operations
  const createProject = useCallback((name: string, description: string, cwd: string, linearIssueKey?: string, workspaceId?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'create_project',
        name,
        description,
        cwd,
        linearIssueKey,
        workspaceId,
      }));
    }
  }, []);

  const subscribeToProject = useCallback((projectId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Clear current state
      setAgents(new Map());
      setTasks([]);
      setGates([]);
      setArtifacts([]);

      wsRef.current.send(JSON.stringify({
        type: 'subscribe_project',
        projectId,
      }));
    }
  }, []);

  const sendProjectMessage = useCallback((projectId: string, message: string | MessagePayload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Build display content for the user message
      const displayContent = typeof message === 'string' ? message : message.text;
      const hasAttachments = typeof message !== 'string' && (
        (message.images?.length ?? 0) > 0 ||
        (message.pdfs?.length ?? 0) > 0 ||
        (message.textFiles?.length ?? 0) > 0
      );

      // Add user message to the EM agent for this project
      const emAgentId = `em-${projectId}`;
      setAgents(prev => {
        const updated = new Map(prev);
        let agent = updated.get(emAgentId);
        if (!agent) {
          agent = { id: emAgentId, status: 'thinking', messages: [] };
        }
        const userMessage: ChatMessage = {
          id: `${Date.now()}-user`,
          role: 'user',
          content: hasAttachments
            ? `${displayContent}${displayContent ? '\n\n' : ''}[Attached files]`
            : displayContent,
          timestamp: Date.now(),
        };
        updated.set(emAgentId, {
          ...agent,
          status: 'thinking',
          messages: [...agent.messages, userMessage],
        });
        return updated;
      });

      wsRef.current.send(JSON.stringify({
        type: 'send_project_message',
        projectId,
        message,
      }));
    }
  }, []);

  const resolveGate = useCallback((gateId: string, status: 'approved' | 'rejected', comment?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'resolve_gate',
        gateId,
        status,
        comment,
      }));
    }
  }, []);

  // Add a local message to the chat feed (display only, doesn't notify EM)
  const addLocalMessage = useCallback((projectId: string, message: string) => {
    const emAgentId = `em-${projectId}`;
    setAgents(prev => {
      const updated = new Map(prev);
      let agent = updated.get(emAgentId);
      if (!agent) {
        agent = { id: emAgentId, status: 'idle', messages: [] };
      }
      const userMessage: ChatMessage = {
        id: `${Date.now()}-user`,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };
      updated.set(emAgentId, {
        ...agent,
        messages: [...agent.messages, userMessage],
      });
      return updated;
    });
  }, []);

  // Workspace operations
  const createWorkspace = useCallback((name: string, path: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'create_workspace',
        name,
        path,
      }));
    }
  }, []);

  const deleteWorkspace = useCallback((workspaceId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'delete_workspace',
        workspaceId,
      }));
    }
  }, []);

  // Agent control operations
  const pauseAgent = useCallback((projectId: string, taskId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'pause_agent',
        projectId,
        taskId,
      }));
    }
  }, []);

  const resumeAgent = useCallback((projectId: string, taskId: string, message?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'resume_agent',
        projectId,
        taskId,
        message,
      }));
    }
  }, []);

  const sendAgentMessage = useCallback((projectId: string, taskId: string, message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Check if agent is paused - if so, queue the message locally
      const task = tasks.find(t => t.id === taskId);
      const agentId = task
        ? `${task.agentType}-${taskId}`
        : `em-${projectId}`;

      const agent = agents.get(agentId);
      if (agent?.isPaused) {
        // Queue message locally
        setAgents(prev => {
          const updated = new Map(prev);
          const currentAgent = updated.get(agentId);
          if (currentAgent) {
            const queuedMessages = currentAgent.queuedMessages || [];
            updated.set(agentId, {
              ...currentAgent,
              queuedMessages: [...queuedMessages, message]
            });
          }
          return updated;
        });
        return;
      }

      // Send message immediately
      wsRef.current.send(JSON.stringify({
        type: 'send_agent_message',
        projectId,
        taskId,
        message,
      }));

      // Add to local messages for immediate UI feedback
      setAgents(prev => {
        const updated = new Map(prev);
        let currentAgent = updated.get(agentId);
        if (!currentAgent) {
          currentAgent = { id: agentId, status: 'thinking', messages: [] };
        }
        const userMessage: ChatMessage = {
          id: `${Date.now()}-user`,
          role: 'user',
          content: message,
          timestamp: Date.now(),
        };
        updated.set(agentId, {
          ...currentAgent,
          status: 'thinking',
          messages: [...currentAgent.messages, userMessage],
        });
        return updated;
      });
    }
  }, [agents, tasks]);

  return {
    isConnected,
    // Agent support
    agents: Array.from(agents.values()),
    // Project support
    projects,
    tasks,
    gates,
    artifacts,
    subscribedProjectId,
    latestCreatedProjectId,
    createProject,
    subscribeToProject,
    sendProjectMessage,
    resolveGate,
    addLocalMessage,
    // Workspace support
    workspaces,
    createWorkspace,
    deleteWorkspace,
    // Agent control
    pauseAgent,
    resumeAgent,
    sendAgentMessage,
    // Helper to get agent by id
    getAgent: (id: string) => agents.get(id),
  };
}
