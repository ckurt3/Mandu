import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ObjectId } from 'mongodb';
import { getCollections } from '../db/mongo.js';
import { SessionManager } from '../sessionManager.js';
import type { Task, AgentType } from '../db/models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load agent system prompts
const AGENT_PROMPTS: Record<AgentType, string> = {
  em: '', // EM is handled separately
  pm: readFileSync(join(__dirname, '../agents/pm.md'), 'utf-8'),
  architect: readFileSync(join(__dirname, '../agents/architect.md'), 'utf-8'),
  developer: readFileSync(join(__dirname, '../agents/developer.md'), 'utf-8'),
  qa: readFileSync(join(__dirname, '../agents/qa.md'), 'utf-8'),
  reviewer: readFileSync(join(__dirname, '../agents/reviewer.md'), 'utf-8'),
};

export class WorkerAgentManager {
  private sessionManager: SessionManager;
  private activeWorkers: Map<string, string> = new Map(); // taskId -> agentId

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  async spawnWorkerForTask(task: Task): Promise<string> {
    const taskId = task._id!.toString();

    // Check if worker already exists for this task
    if (this.activeWorkers.has(taskId)) {
      return this.activeWorkers.get(taskId)!;
    }

    // Don't spawn workers for EM tasks
    if (task.assignedAgent === 'em') {
      throw new Error('EM tasks are handled by EMAgentManager');
    }

    const collections = getCollections();
    // task.projectId may be a string (from change stream) or ObjectId
    const projectId = typeof task.projectId === 'string'
      ? new ObjectId(task.projectId)
      : task.projectId;
    const project = await collections.projects.findOne({
      _id: projectId,
    });

    if (!project) {
      throw new Error(`Project ${task.projectId} not found`);
    }

    // Create worker agent session
    const agentId = `${task.assignedAgent}-${taskId}`;
    const projectIdStr = task.projectId.toString();
    this.sessionManager.createSession(agentId, project.cwd, projectIdStr);

    // Update task with agent session ID
    // task._id may be a string (from change stream) or ObjectId
    const taskObjectId = typeof task._id === 'string'
      ? new ObjectId(task._id)
      : task._id;
    await collections.tasks.updateOne(
      { _id: taskObjectId },
      {
        $set: {
          agentSessionId: agentId,
          status: 'in_progress',
          updatedAt: new Date(),
        },
      }
    );

    this.activeWorkers.set(taskId, agentId);

    // Initialize worker with system prompt and task
    await this.initializeWorker(agentId, task);

    return agentId;
  }

  private async initializeWorker(agentId: string, task: Task): Promise<void> {
    console.log(`[WorkerAgent] Initializing worker ${agentId} for task: ${task.title}`);
    const systemPrompt = AGENT_PROMPTS[task.assignedAgent];

    // Get related artifacts for context
    const collections = getCollections();
    // projectId may be string (from change stream) or ObjectId
    const projectIdForQuery = typeof task.projectId === 'string'
      ? new ObjectId(task.projectId)
      : task.projectId;
    const artifacts = await collections.artifacts
      .find({ projectId: projectIdForQuery })
      .toArray();

    const artifactSummary = artifacts.length > 0
      ? artifacts.map(a => `- ${a.name} (${a.type}): ${a._id}`).join('\n')
      : 'No artifacts yet.';

    const initMessage = `${systemPrompt}

---

## Your Task

**Task ID**: ${task._id}
**Title**: ${task.title}
**Description**: ${task.description}
${task.context ? `**Additional Context**: ${task.context}` : ''}

## Available Artifacts
${artifactSummary}

---

Please complete this task. When done, use \`mandu__complete_task\` with the task ID and a summary of what you accomplished.`;

    try {
      await this.sessionManager.sendMessage(agentId, initMessage);
      console.log(`[WorkerAgent] Worker ${agentId} completed successfully`);
    } catch (error) {
      console.error(`[WorkerAgent] Worker ${agentId} failed:`, error);
      throw error;
    }
  }

  getWorkerAgentId(taskId: string): string | undefined {
    return this.activeWorkers.get(taskId);
  }

  stopWorkerForTask(taskId: string): void {
    const agentId = this.activeWorkers.get(taskId);
    if (agentId) {
      this.sessionManager.closeSession(agentId);
      this.activeWorkers.delete(taskId);
    }
  }

  getAllActiveWorkers(): Array<{ taskId: string; agentId: string }> {
    return Array.from(this.activeWorkers.entries()).map(([taskId, agentId]) => ({
      taskId,
      agentId,
    }));
  }
}
