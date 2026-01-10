import { useEffect, useRef, useState, useCallback } from 'react';
import type { AgentState, ServerMessage, ChatMessage, Project, Task, Gate, Artifact, GateStatus } from '../types';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [subscribedProjectId, setSubscribedProjectId] = useState<string | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3000`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
      // Request project list on connect
      ws.send(JSON.stringify({ type: 'list_projects' }));
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

  // Fetch session history from REST API
  const fetchSessionHistory = useCallback(async (agentId: string) => {
    try {
      const response = await fetch(`/api/session/${agentId}/history`);
      if (!response.ok) {
        console.error('Failed to fetch session history');
        return;
      }

      const data = await response.json();
      if (data.messages && data.messages.length > 0) {
        setAgents(prev => {
          const updated = new Map(prev);
          const restoredMessages: ChatMessage[] = data.messages.map((m: {
            role: 'user' | 'assistant' | 'tool';
            content: string;
            toolName?: string;
            toolInput?: Record<string, unknown>;
            isToolResult?: boolean;
            timestamp: number;
          }, i: number) => ({
            id: `history-${m.timestamp}-${i}`,
            role: m.role,
            content: m.content,
            toolName: m.toolName,
            toolInput: m.toolInput,
            isToolResult: m.isToolResult,
            timestamp: m.timestamp,
          }));
          updated.set(agentId, {
            id: agentId,
            status: 'idle',
            messages: restoredMessages,
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Error fetching session history:', error);
    }
  }, []);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      // Project messages
      case 'projects_list':
        if (message.projects) {
          setProjects(message.projects.map(p => ({
            _id: p._id,
            name: p.name,
            description: p.description,
            cwd: '',
            status: p.status as 'active' | 'archived',
            emAgentId: p.emAgentId,
            createdAt: '',
            updatedAt: '',
          })));
        }
        break;

      case 'project_created':
        if (message.projectId && message.name) {
          setProjects(prev => {
            // Check if already exists (may come from db_change too)
            if (prev.some(p => p._id === message.projectId)) {
              return prev;
            }
            const newProject: Project = {
              _id: message.projectId,
              name: message.name,
              description: '',
              cwd: '',
              status: 'active',
              emAgentId: message.emAgentId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            return [...prev, newProject];
          });
        }
        break;

      case 'project_subscribed':
        setSubscribedProjectId(message.projectId || null);
        // Clear project-specific state when switching
        setTasks([]);
        setGates([]);
        setArtifacts([]);
        // Fetch session history for the EM agent
        if (message.projectId) {
          const project = projects.find(p => p._id === message.projectId);
          if (project?.emAgentId) {
            fetchSessionHistory(project.emAgentId);
          }
        }
        break;

      case 'gate_resolved':
        if (message.gateId) {
          setGates(prev => prev.map(g =>
            g._id === message.gateId
              ? { ...g, status: message.status as GateStatus }
              : g
          ));
        }
        break;

      // Database change messages
      case 'db_change':
        handleDbChange(message);
        break;

      // Agent messages
      case 'agent_created':
        if (message.agentId) {
          setAgents(prev => {
            const updated = new Map(prev);
            updated.set(message.agentId!, {
              id: message.agentId!,
              status: 'idle',
              messages: [],
            });
            return updated;
          });
        }
        break;

      case 'agent_status':
        if (message.agentId && message.status) {
          console.log(`[WS] agent_status: ${message.agentId} -> ${message.status}`);
          setAgents(prev => {
            const updated = new Map(prev);
            let agent = updated.get(message.agentId!);
            if (!agent) {
              console.log(`[WS] Creating new agent: ${message.agentId}`);
              agent = { id: message.agentId!, status: 'idle', messages: [] };
            }
            updated.set(message.agentId!, { ...agent, status: message.status! });
            return updated;
          });
        }
        break;

      case 'agent_message':
        if (message.agentId && message.content !== undefined) {
          setAgents(prev => {
            const updated = new Map(prev);
            let agent = updated.get(message.agentId!);
            if (!agent) {
              agent = { id: message.agentId!, status: 'idle', messages: [] };
            }
            const newMessage: ChatMessage = {
              id: `${Date.now()}-${Math.random()}`,
              role: 'assistant',
              content: message.content!,
              isPartial: message.isPartial,
              timestamp: Date.now(),
            };
            const messages = [...agent.messages];
            if (messages.length > 0 && messages[messages.length - 1].isPartial) {
              messages[messages.length - 1] = newMessage;
            } else {
              messages.push(newMessage);
            }
            updated.set(message.agentId!, { ...agent, messages });
            return updated;
          });
        }
        break;

      case 'agent_result':
        if (message.agentId) {
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(message.agentId!);
            if (agent) {
              const messages = agent.messages.filter(m => !m.isPartial);
              updated.set(message.agentId!, { ...agent, messages, status: 'idle' });
            }
            return updated;
          });
        }
        break;

      case 'agent_error':
        if (message.agentId) {
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(message.agentId!);
            if (agent) {
              const errorMessage: ChatMessage = {
                id: `${Date.now()}-error`,
                role: 'assistant',
                content: `Error: ${message.error}`,
                timestamp: Date.now(),
              };
              updated.set(message.agentId!, {
                ...agent,
                messages: [...agent.messages.filter(m => !m.isPartial), errorMessage],
                status: 'error',
              });
            }
            return updated;
          });
        }
        break;

      case 'agent_tool_use':
        if (message.agentId) {
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(message.agentId!);
            if (agent) {
              const toolMessage: ChatMessage = {
                id: `${Date.now()}-tool-${Math.random()}`,
                role: 'tool',
                content: '',
                toolName: message.toolName,
                toolInput: message.toolInput,
                timestamp: Date.now(),
              };
              updated.set(message.agentId!, {
                ...agent,
                messages: [...agent.messages, toolMessage],
              });
            }
            return updated;
          });
        }
        break;

      case 'agent_tool_result':
        if (message.agentId) {
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(message.agentId!);
            if (agent) {
              const resultMessage: ChatMessage = {
                id: `${Date.now()}-result-${Math.random()}`,
                role: 'tool',
                content: message.output || '',
                isToolResult: true,
                timestamp: Date.now(),
              };
              updated.set(message.agentId!, {
                ...agent,
                messages: [...agent.messages, resultMessage],
              });
            }
            return updated;
          });
        }
        break;

      case 'agent_user_message':
        // Handle replayed user messages from session resumption
        if (message.agentId && message.content) {
          setAgents(prev => {
            const updated = new Map(prev);
            let agent = updated.get(message.agentId!);
            if (!agent) {
              agent = { id: message.agentId!, status: 'idle', messages: [] };
            }
            const userMessage: ChatMessage = {
              id: `replay-${Date.now()}-${Math.random()}`,
              role: 'user',
              content: message.content!,
              timestamp: Date.now(),
            };
            updated.set(message.agentId!, {
              ...agent,
              messages: [...agent.messages, userMessage],
            });
            return updated;
          });
        }
        break;

      case 'agent_history':
        // Restore chat history for an agent (on reconnect)
        if (message.agentId && message.messages) {
          setAgents(prev => {
            const updated = new Map(prev);
            const restoredMessages: ChatMessage[] = message.messages!.map((m, i) => ({
              id: `history-${m.timestamp}-${i}`,
              role: m.role,
              content: m.content,
              toolName: m.toolName,
              toolInput: m.toolInput,
              isToolResult: m.isToolResult,
              timestamp: m.timestamp,
            }));
            updated.set(message.agentId!, {
              id: message.agentId!,
              status: 'idle',
              messages: restoredMessages,
            });
            return updated;
          });
        }
        break;
    }
  }, [projects, fetchSessionHistory]);

  const handleDbChange = useCallback((message: ServerMessage) => {
    const { collection, operation, document } = message;
    if (!collection || !document) return;

    switch (collection) {
      case 'projects':
        if (operation === 'insert') {
          // Only add if not already present (may have been added by project_created)
          setProjects(prev => {
            const exists = prev.some(p => p._id === (document as Project)._id);
            if (exists) return prev;
            return [...prev, document as Project];
          });
        } else if (operation === 'update' || operation === 'replace') {
          const updated = document as Project;
          setProjects(prev => prev.map(p => p._id === updated._id ? updated : p));
        } else if (operation === 'delete') {
          setProjects(prev => prev.filter(p => p._id !== message.documentId));
        }
        break;

      case 'tasks':
        if (operation === 'insert') {
          setTasks(prev => [...prev, document as Task]);
        } else if (operation === 'update' || operation === 'replace') {
          const updated = document as Task;
          setTasks(prev => prev.map(t => t._id === updated._id ? updated : t));
        } else if (operation === 'delete') {
          setTasks(prev => prev.filter(t => t._id !== message.documentId));
        }
        break;

      case 'gates':
        if (operation === 'insert') {
          setGates(prev => [...prev, document as Gate]);
        } else if (operation === 'update' || operation === 'replace') {
          const updated = document as Gate;
          setGates(prev => prev.map(g => g._id === updated._id ? updated : g));
        } else if (operation === 'delete') {
          setGates(prev => prev.filter(g => g._id !== message.documentId));
        }
        break;

      case 'artifacts':
        if (operation === 'insert') {
          setArtifacts(prev => [...prev, document as Artifact]);
        } else if (operation === 'update' || operation === 'replace') {
          const updated = document as Artifact;
          setArtifacts(prev => prev.map(a => a._id === updated._id ? updated : a));
        } else if (operation === 'delete') {
          setArtifacts(prev => prev.filter(a => a._id !== message.documentId));
        }
        break;
    }
  }, []);

  // Project operations
  const createProject = useCallback((name: string, description: string, cwd: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'create_project',
        name,
        description,
        cwd,
      }));
    }
  }, []);

  const subscribeToProject = useCallback((projectId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe_project',
        projectId,
      }));
    }
  }, []);

  const sendProjectMessage = useCallback((projectId: string, message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Get the EM agent for this project
      const project = projects.find(p => p._id === projectId);
      if (project?.emAgentId) {
        // Add user message to EM agent state and reset status (clear error state)
        setAgents(prev => {
          const updated = new Map(prev);
          let agent = updated.get(project.emAgentId!);
          if (!agent) {
            agent = { id: project.emAgentId!, status: 'idle', messages: [] };
          }
          const userMessage: ChatMessage = {
            id: `${Date.now()}-user`,
            role: 'user',
            content: message,
            timestamp: Date.now(),
          };
          updated.set(project.emAgentId!, {
            ...agent,
            status: 'thinking', // Reset to thinking, clears error state
            messages: [...agent.messages, userMessage],
          });
          return updated;
        });
      }

      wsRef.current.send(JSON.stringify({
        type: 'send_project_message',
        projectId,
        message,
      }));
    }
  }, [projects]);

  const resolveGate = useCallback((gateId: string, status: 'approved' | 'changes_requested', comment?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'resolve_gate',
        gateId,
        status,
        comment,
      }));
    }
  }, []);

  // Legacy agent operations (for standalone agents)
  const createAgent = useCallback((agentId: string, cwd?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'create_agent',
        agentId,
        cwd,
      }));
    }
  }, []);

  const sendMessage = useCallback((agentId: string, message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setAgents(prev => {
        const updated = new Map(prev);
        const agent = updated.get(agentId);
        if (agent) {
          const userMessage: ChatMessage = {
            id: `${Date.now()}-user`,
            role: 'user',
            content: message,
            timestamp: Date.now(),
          };
          updated.set(agentId, {
            ...agent,
            messages: [...agent.messages, userMessage],
          });
        }
        return updated;
      });

      wsRef.current.send(JSON.stringify({
        type: 'send_message',
        agentId,
        message,
      }));
    }
  }, []);

  const closeAgent = useCallback((agentId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'close_agent',
        agentId,
      }));
    }
    setAgents(prev => {
      const updated = new Map(prev);
      updated.delete(agentId);
      return updated;
    });
  }, []);

  return {
    isConnected,
    // Legacy agent support
    agents: Array.from(agents.values()),
    createAgent,
    sendMessage,
    closeAgent,
    // Project support
    projects,
    tasks,
    gates,
    artifacts,
    subscribedProjectId,
    createProject,
    subscribeToProject,
    sendProjectMessage,
    resolveGate,
    // Helper to get agent by id
    getAgent: (id: string) => agents.get(id),
  };
}
