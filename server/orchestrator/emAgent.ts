import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ObjectId } from 'mongodb';
import { getCollections } from '../db/mongo.js';
import { SessionManager } from '../sessionManager.js';
import type { Project } from '../db/models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load EM system prompt
const EM_SYSTEM_PROMPT = readFileSync(
  join(__dirname, '../agents/em.md'),
  'utf-8'
);

export class EMAgentManager {
  private sessionManager: SessionManager;
  private activeEMs: Map<string, string> = new Map(); // projectId -> agentId

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  async startEMForProject(projectId: string): Promise<string> {
    // Check if EM already exists in memory
    if (this.activeEMs.has(projectId)) {
      return this.activeEMs.get(projectId)!;
    }

    const collections = getCollections();
    const project = await collections.projects.findOne({
      _id: new ObjectId(projectId),
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const agentId = `em-${projectId}`;

    // Check if we have a saved session to resume
    const savedSession = await collections.agentSessions.findOne({ agentId });
    const existingSessionId = savedSession?.sessionId;

    // EM agent is restricted to only mandu__* MCP tools
    // This prevents the EM from reading files, running commands, etc.
    const emAllowedTools = [
      'mcp__mandu__create_task',
      'mcp__mandu__update_task',
      'mcp__mandu__complete_task',
      'mcp__mandu__get_task',
      'mcp__mandu__list_tasks',
      'mcp__mandu__create_artifact',
      'mcp__mandu__update_artifact',
      'mcp__mandu__get_artifact',
      'mcp__mandu__list_artifacts',
      'mcp__mandu__create_gate',
      'mcp__mandu__get_gate',
      'mcp__mandu__list_pending_gates',
      'mcp__mandu__get_project_status',
    ];

    // Create or resume EM agent session with tool restrictions
    this.sessionManager.createSession(agentId, project.cwd, projectId, existingSessionId, {
      allowedTools: emAllowedTools,
      systemPrompt: EM_SYSTEM_PROMPT,
    });

    // Update project with EM agent ID
    await collections.projects.updateOne(
      { _id: new ObjectId(projectId) },
      { $set: { emAgentId: agentId, updatedAt: new Date() } }
    );

    this.activeEMs.set(projectId, agentId);

    // Only initialize if this is a new session (no existing sessionId)
    if (!existingSessionId) {
      await this.initializeEM(agentId, project);
    }

    return agentId;
  }

  private async initializeEM(agentId: string, project: Project): Promise<void> {
    const hasDescription = project.description && project.description.trim().length > 0;

    // System prompt is now passed via SDK options, so we just send project context
    const initMessage = `## Project: ${project.name}
${hasDescription ? `Goal: ${project.description}` : ''}
Working Directory: ${project.cwd}

${hasDescription
  ? `Acknowledge the project goal briefly, then start planning. Create the first task (usually for PM to write a spec). Keep your response to 2-3 sentences.`
  : `The user hasn't described what to build yet. Ask them briefly what they'd like to accomplish.`
}`;

    await this.sessionManager.sendMessage(agentId, initMessage);
  }

  async sendMessageToEM(projectId: string, message: string): Promise<void> {
    const agentId = this.activeEMs.get(projectId);
    if (!agentId) {
      throw new Error(`No EM agent for project ${projectId}`);
    }

    await this.sessionManager.sendMessage(agentId, message);
  }

  getEMAgentId(projectId: string): string | undefined {
    return this.activeEMs.get(projectId);
  }

  stopEMForProject(projectId: string): void {
    const agentId = this.activeEMs.get(projectId);
    if (agentId) {
      this.sessionManager.closeSession(agentId);
      this.activeEMs.delete(projectId);
    }
  }

  getAllActiveEMs(): Array<{ projectId: string; agentId: string }> {
    return Array.from(this.activeEMs.entries()).map(([projectId, agentId]) => ({
      projectId,
      agentId,
    }));
  }
}
