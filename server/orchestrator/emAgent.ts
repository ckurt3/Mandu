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

    const agentId = `em-${projectId}`;

    // Add to map immediately to prevent race conditions
    this.activeEMs.set(projectId, agentId);

    try {
      const collections = getCollections();
      const project = await collections.projects.findOne({
        _id: new ObjectId(projectId),
      });

      if (!project) {
        this.activeEMs.delete(projectId);
        throw new Error(`Project ${projectId} not found`);
      }

      // Check if we have a saved session to resume
      const savedSession = await collections.agentSessions.findOne({ agentId });
      const existingSessionId = savedSession?.sessionId;

      // EM agent is restricted to MongoDB and Linear MCP tools only
      // This prevents the EM from reading files, running commands, etc.
      // The EM orchestrates by creating tasks/gates/artifacts in the database
      // and can fetch issue details from Linear
      const emAllowedTools = [
        'mcp__mongodb__find',
        'mcp__mongodb__insert-many',
        'mcp__mongodb__update-many',
        'mcp__mongodb__aggregate',
        'mcp__mongodb__count',
        'mcp__mongodb__collection-schema',
        'mcp__linear__get_issue',
        'mcp__linear__list_issues',
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

      // Only initialize if this is a new session (no existing sessionId)
      if (!existingSessionId) {
        await this.initializeEM(agentId, project);
      }

      return agentId;
    } catch (error) {
      this.activeEMs.delete(projectId);
      throw error;
    }
  }

  private async initializeEM(agentId: string, project: Project): Promise<void> {
    const projectId = project._id!.toString();

    // Check if project was created from a Linear issue
    const linearIssueKey = (project as { linearIssueKey?: string }).linearIssueKey;

    let initMessage: string;
    if (linearIssueKey) {
      // Project created from Linear issue - fetch details first
      initMessage = `Your project ID is: ${projectId}

This project was created from Linear issue: ${linearIssueKey}

First, use the Linear MCP tool (mcp__linear__get_issue) to fetch the issue details for "${linearIssueKey}".
Then query the projects collection to update your understanding, and start planning based on the Linear issue requirements.`;
    } else {
      // Regular project - query for details
      initMessage = `Your project ID is: ${projectId}

Query the projects collection to get project details, then start planning.`;
    }

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
