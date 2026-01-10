import { query, type SDKMessage, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type { AgentStatus } from '../shared/types.js';
import { createManduMcpServer } from './mcp/manduTools.js';

export interface AgentSession {
  id: string;
  status: AgentStatus;
  cwd: string;
  queryInstance: AsyncGenerator<SDKMessage, void, unknown> | null;
  sessionId?: string;
  projectId?: string;
  mcpServer?: McpSdkServerConfigWithInstance;
  allowedTools?: string[];
  systemPrompt?: string;
}

type MessageCallback = (agentId: string, message: SDKMessage) => void;
type StatusCallback = (agentId: string, status: AgentStatus) => void;
type ErrorCallback = (agentId: string, error: Error) => void;
type SessionIdCallback = (agentId: string, sessionId: string, projectId?: string) => void;

export class SessionManager {
  private sessions: Map<string, AgentSession> = new Map();
  private onMessage: MessageCallback;
  private onStatus: StatusCallback;
  private onError: ErrorCallback;
  private onSessionId?: SessionIdCallback;

  constructor(callbacks: {
    onMessage: MessageCallback;
    onStatus: StatusCallback;
    onError: ErrorCallback;
    onSessionId?: SessionIdCallback;
  }) {
    this.onMessage = callbacks.onMessage;
    this.onStatus = callbacks.onStatus;
    this.onError = callbacks.onError;
    this.onSessionId = callbacks.onSessionId;
  }

  createSession(
    agentId: string,
    cwd?: string,
    projectId?: string,
    existingSessionId?: string,
    options?: {
      allowedTools?: string[];
      systemPrompt?: string;
    }
  ): AgentSession {
    // If session exists and we're resuming, just return it
    if (this.sessions.has(agentId)) {
      const existing = this.sessions.get(agentId)!;
      // Update sessionId if provided
      if (existingSessionId) {
        existing.sessionId = existingSessionId;
      }
      return existing;
    }

    const session: AgentSession = {
      id: agentId,
      status: 'idle',
      cwd: cwd || process.cwd(),
      queryInstance: null,
      sessionId: existingSessionId,
      projectId,
      mcpServer: projectId ? createManduMcpServer(projectId) : undefined,
      allowedTools: options?.allowedTools,
      systemPrompt: options?.systemPrompt,
    };

    this.sessions.set(agentId, session);
    this.onStatus(agentId, 'idle');
    return session;
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) {
      throw new Error(`Session ${agentId} not found`);
    }

    session.status = 'thinking';
    this.onStatus(agentId, 'thinking');

    try {
      const queryOptions: Parameters<typeof query>[0] = {
        prompt: message,
        options: {
          cwd: session.cwd,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
        },
      };

      // Add MCP server for project-bound sessions
      if (session.mcpServer) {
        queryOptions.options!.mcpServers = {
          mandu: session.mcpServer,
        };
      }

      // Resume session if we have a previous session ID
      if (session.sessionId) {
        queryOptions.options!.resume = session.sessionId;
      }

      // Add tool restrictions if specified
      if (session.allowedTools && session.allowedTools.length > 0) {
        queryOptions.options!.allowedTools = session.allowedTools;
      }

      // Add system prompt if specified
      if (session.systemPrompt) {
        queryOptions.options!.systemPrompt = session.systemPrompt;
      }

      console.log(`[${agentId}] Starting query with options:`, JSON.stringify({
        prompt: message.slice(0, 100) + '...',
        cwd: queryOptions.options?.cwd,
        permissionMode: queryOptions.options?.permissionMode,
        hasMcpServer: !!queryOptions.options?.mcpServers,
        resumeSessionId: queryOptions.options?.resume,
        allowedTools: queryOptions.options?.allowedTools,
        hasSystemPrompt: !!queryOptions.options?.systemPrompt,
      }));

      const queryInstance = query(queryOptions);
      session.queryInstance = queryInstance;

      for await (const sdkMessage of queryInstance) {
        // Capture session ID for future resumption
        if ('session_id' in sdkMessage && sdkMessage.session_id) {
          const isNew = session.sessionId !== sdkMessage.session_id;
          session.sessionId = sdkMessage.session_id;
          // Notify about new sessionId so it can be persisted
          if (isNew && this.onSessionId) {
            this.onSessionId(agentId, sdkMessage.session_id, session.projectId);
          }
        }

        this.onMessage(agentId, sdkMessage);
      }

      session.status = 'idle';
      this.onStatus(agentId, 'idle');
    } catch (error) {
      console.error(`[${agentId}] Query error:`, error);
      session.status = 'error';
      this.onStatus(agentId, 'error');
      this.onError(agentId, error instanceof Error ? error : new Error(String(error)));
    } finally {
      session.queryInstance = null;
    }
  }

  closeSession(agentId: string): void {
    const session = this.sessions.get(agentId);
    if (!session) {
      return;
    }

    session.status = 'closed';
    this.onStatus(agentId, 'closed');
    this.sessions.delete(agentId);
  }

  getSession(agentId: string): AgentSession | undefined {
    return this.sessions.get(agentId);
  }

  getAllSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }
}
