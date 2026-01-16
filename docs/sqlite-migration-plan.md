# SQLite Migration Plan

Migrate Mandu from MongoDB + Change Streams to SQLite + Direct Orchestration.

## Goals

1. **No MongoDB** - SQLite for all persistence
2. **Zero-config DevX** - `npm run dev` with no external dependencies
3. **Durability** - Resume workflows after restart, retry failed operations
4. **Keep dynamic orchestration** - EM agent decides workflow shape at runtime

## Phase 1: SQLite Foundation

### 1.1 Add Dependencies

```bash
npm install better-sqlite3 drizzle-orm
npm install -D drizzle-kit @types/better-sqlite3
```

### 1.2 Create Schema

```typescript
// server/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  cwd: text('cwd'),
  status: text('status').default('active'), // active, completed, archived
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).defaultNow(),
});

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  status: text('status').default('pending'), // pending, running, waiting_approval, completed, failed
  currentStep: text('current_step'), // For resumption: 'pm', 'architect', 'developer-0', etc.
  request: text('request'), // Original user request
  emSessionId: text('em_session_id'), // Reference to EM's agent session
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).defaultNow(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  agentType: text('agent_type').notNull(), // pm, architect, developer, qa, reviewer
  title: text('title').notNull(),
  input: text('input'), // JSON - what the agent received
  output: text('output'), // JSON - what the agent returned
  status: text('status').default('pending'), // pending, running, completed, failed
  error: text('error'), // Error message if failed
  attempts: integer('attempts').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  taskId: text('task_id').references(() => tasks.id),
  type: text('type').notNull(), // spec, design_doc, code_change, test_report, review, markdown
  title: text('title').notNull(),
  content: text('content'), // For inline content
  filePath: text('file_path'), // For file references
  metadata: text('metadata'), // JSON - language, line count, etc.
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
});

export const gates = sqliteTable('gates', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  type: text('type').notNull(), // approval, clarification, review
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('pending'), // pending, approved, rejected
  requestedAt: integer('requested_at', { mode: 'timestamp' }).defaultNow(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  resolvedBy: text('resolved_by'),
  resolution: text('resolution'), // JSON - approval notes, clarification response, etc.
});

export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  runId: text('run_id').references(() => runs.id),
  agentType: text('agent_type').notNull(), // em, pm, architect, developer, qa, reviewer
  sessionData: text('session_data'), // JSON - serialized Claude session
  status: text('status').default('active'), // active, paused, completed
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).defaultNow(),
});

// Indexes
// CREATE INDEX idx_runs_project ON runs(project_id);
// CREATE INDEX idx_runs_status ON runs(status);
// CREATE INDEX idx_tasks_run ON tasks(run_id);
// CREATE INDEX idx_tasks_status ON tasks(status);
// CREATE INDEX idx_artifacts_run ON artifacts(run_id);
// CREATE INDEX idx_gates_run ON gates(run_id);
// CREATE INDEX idx_gates_status ON gates(status);
```

### 1.3 Database Client

```typescript
// server/db/client.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const sqlite = new Database(path.join(DATA_DIR, 'mandu.db'));
sqlite.pragma('journal_mode = WAL'); // Better concurrent access
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite }; // For raw queries if needed
```

### 1.4 Migration Script

```typescript
// server/db/migrate.ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client';

migrate(db, { migrationsFolder: './server/db/migrations' });
console.log('Migrations complete');
```

Add to package.json:
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate:sqlite --schema=./server/db/schema.ts --out=./server/db/migrations",
    "db:migrate": "tsx server/db/migrate.ts",
    "db:reset": "rm -f data/mandu.db && npm run db:migrate"
  }
}
```

---

## Phase 2: EM Agent Refactor

The big change: EM becomes event-driven. Workers run in parallel, EM stays conversational.

### 2.1 Core Types

```typescript
// server/orchestrator/types.ts

export interface RunContext {
  runId: string;
  projectId: string;
  cwd: string;
  request: string;
}

export interface EMDecision {
  type: 'spawn_worker' | 'create_gate' | 'complete' | 'fail';
  // For spawn_worker
  agentType?: 'pm' | 'architect' | 'developer' | 'qa' | 'reviewer';
  taskInput?: Record<string, unknown>;
  // For create_gate
  gateType?: string;
  gateTitle?: string;
  gateDescription?: string;
  // For complete/fail
  summary?: string;
  error?: string;
}

// Events that flow into EM's conversation
export type EMEvent =
  | { type: 'user_message'; content: string }
  | { type: 'worker_completed'; taskId: string; agentType: string; summary: string }
  | { type: 'worker_failed'; taskId: string; agentType: string; error: string }
  | { type: 'gate_resolved'; gateId: string; status: 'approved' | 'rejected'; notes?: string };

export interface WorkerResult {
  success: boolean;
  taskId: string;
  summary: string;
  error?: string;
}
```

### 2.2 Event-Driven EM Agent Loop

Key change: `spawn_worker` is fire-and-forget. EM can spawn multiple workers, chat with user, and react to completions as events.

Uses Node's built-in `EventEmitter` + `events.on()` for a clean async iterator pattern.

```typescript
// server/orchestrator/emAgent.ts

import { EventEmitter, on } from 'node:events';
import { Claude } from '@anthropic-ai/claude-agent-sdk';
import { db } from '../db/client';
import { runs, tasks, gates, agentSessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { spawnWorkerAgent } from './workerAgent';
import { broadcastToProject } from '../websocket';
import { EMDecision, EMEvent, RunContext } from './types';
import { randomUUID } from 'crypto';

// Event emitters per run - workers and gates push events here
const runEmitters = new Map<string, EventEmitter>();

function getEmitter(runId: string): EventEmitter {
  if (!runEmitters.has(runId)) {
    runEmitters.set(runId, new EventEmitter());
  }
  return runEmitters.get(runId)!;
}

export function pushEvent(runId: string, event: EMEvent): void {
  getEmitter(runId).emit('event', event);
}

export async function runEMAgent(context: RunContext): Promise<void> {
  const { runId, projectId, request } = context;

  const emitter = getEmitter(runId);

  // Load or create EM session
  let session = await loadEMSession(runId);
  if (!session) {
    session = await createEMSession(runId, request);
  }

  // Update run status
  await db.update(runs)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(runs.id, runId));

  broadcastToProject(projectId, {
    type: 'run_status',
    runId,
    status: 'running',
  });

  try {
    // Initial EM turn to kick things off
    let decision = await emAgentTurn(session);
    let shouldContinue = await executeDecision(context, decision);

    if (shouldContinue) {
      // Event loop - EM reacts to events as they arrive
      for await (const [event] of on(emitter, 'event')) {
        // Inject event into EM conversation
        session.addMessage({
          role: 'user',
          content: formatEvent(event),
        });

        // Checkpoint session
        await checkpointEMSession(runId, session);

        // EM decides what to do next
        decision = await emAgentTurn(session);

        shouldContinue = await executeDecision(context, decision);
        if (!shouldContinue) break;
      }
    }
  } catch (error) {
    console.error(`EM Agent error for run ${runId}:`, error);
    await db.update(runs)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(runs.id, runId));

    broadcastToProject(projectId, {
      type: 'run_status',
      runId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    // Cleanup
    runEmitters.delete(runId);
  }
}

function formatEvent(event: EMEvent): string {
  switch (event.type) {
    case 'user_message':
      return `User says: ${event.content}`;
    case 'worker_completed':
      return `Worker ${event.agentType} (task ${event.taskId}) completed: ${event.summary}`;
    case 'worker_failed':
      return `Worker ${event.agentType} (task ${event.taskId}) failed: ${event.error}`;
    case 'gate_resolved':
      return `Gate ${event.gateId} was ${event.status}${event.notes ? `: ${event.notes}` : ''}`;
  }
}

async function executeDecision(context: RunContext, decision: EMDecision): Promise<boolean> {
  const { runId, projectId, cwd } = context;

  switch (decision.type) {
    case 'spawn_worker': {
      const taskId = randomUUID();

      // Record task
      await db.insert(tasks).values({
        id: taskId,
        runId,
        agentType: decision.agentType!,
        title: `${decision.agentType} task`,
        input: JSON.stringify(decision.taskInput),
        status: 'running',
      });

      broadcastToProject(projectId, {
        type: 'task_started',
        runId,
        taskId,
        agentType: decision.agentType,
      });

      // Fire-and-forget: spawn worker in background
      spawnWorkerAgent({
        taskId,
        runId,
        projectId,
        agentType: decision.agentType!,
        input: decision.taskInput!,
        cwd,
        onMessage: (message) => {
          broadcastToProject(projectId, {
            type: 'agent_message',
            runId,
            taskId,
            agentType: decision.agentType,
            message,
          });
        },
        onComplete: (result) => {
          // Push completion event to EM
          pushEvent(runId, {
            type: result.success ? 'worker_completed' : 'worker_failed',
            taskId,
            agentType: decision.agentType!,
            ...(result.success
              ? { summary: result.summary }
              : { error: result.error! }),
          } as EMEvent);
        },
      });

      return true; // Continue loop
    }

    case 'create_gate': {
      const gateId = randomUUID();
      await db.insert(gates).values({
        id: gateId,
        runId,
        type: decision.gateType!,
        title: decision.gateTitle!,
        description: decision.gateDescription,
        status: 'pending',
      });

      broadcastToProject(projectId, {
        type: 'gate_created',
        runId,
        gate: { id: gateId, type: decision.gateType, title: decision.gateTitle },
      });

      // Gate resolution will come as an event when user responds
      return true;
    }

    case 'complete': {
      await db.update(runs)
        .set({ status: 'completed', currentStep: null, updatedAt: new Date() })
        .where(eq(runs.id, runId));

      await db.update(agentSessions)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(agentSessions.runId, runId));

      broadcastToProject(projectId, {
        type: 'run_status',
        runId,
        status: 'completed',
        summary: decision.summary,
      });

      return false; // Exit loop
    }

    case 'fail': {
      await db.update(runs)
        .set({ status: 'failed', currentStep: null, updatedAt: new Date() })
        .where(eq(runs.id, runId));

      broadcastToProject(projectId, {
        type: 'run_status',
        runId,
        status: 'failed',
        error: decision.error,
      });

      return false; // Exit loop
    }
  }
}
```

### 2.3 EM Agent System Prompt

Update `server/agents/em.md` to remove MongoDB MCP instructions:

```markdown
# Engineering Manager Agent

You orchestrate a development team. For each request, analyze it and decide what to do next.

## Your Tools

You have structured output tools to make decisions:
- `spawn_worker(agentType, taskInput)` - Delegate work to a specialist
- `create_gate(type, title, description)` - Request human approval/input
- `complete(summary)` - Mark the run as complete
- `fail(error)` - Mark the run as failed

## Agent Types

- **pm** - Requirements analysis, specifications
- **architect** - System design, technical decisions
- **developer** - Implementation, code changes
- **qa** - Testing, validation
- **reviewer** - Code review, feedback

## Decision Flow

1. Analyze the request and current state
2. Decide which agent should work next (or if you need human input)
3. Provide clear input for the worker
4. Review their output and decide next steps
5. Continue until the work is complete

## Guidelines

- Start with PM for requirements unless they're already clear
- Get architecture approval before implementation
- You can spawn multiple developers for parallel work
- Always have QA validate before completion
- Request human gates when decisions have significant impact
```

### 2.4 EM Decision Parser

```typescript
// server/orchestrator/emDecisionParser.ts

import { EMDecision } from './types';

// EM will output structured decisions via tool calls
export const EM_TOOLS = [
  {
    name: 'spawn_worker',
    description: 'Delegate a task to a specialist agent',
    input_schema: {
      type: 'object',
      properties: {
        agentType: {
          type: 'string',
          enum: ['pm', 'architect', 'developer', 'qa', 'reviewer'],
          description: 'The type of agent to spawn',
        },
        taskInput: {
          type: 'object',
          description: 'Input data for the agent (requirements, context, etc.)',
        },
      },
      required: ['agentType', 'taskInput'],
    },
  },
  {
    name: 'create_gate',
    description: 'Request human approval or input',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['approval', 'clarification', 'review'],
        },
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['type', 'title'],
    },
  },
  {
    name: 'complete',
    description: 'Mark the run as successfully completed',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of what was accomplished' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'fail',
    description: 'Mark the run as failed',
    input_schema: {
      type: 'object',
      properties: {
        error: { type: 'string', description: 'Why the run failed' },
      },
      required: ['error'],
    },
  },
];

export function parseEMToolCall(toolName: string, toolInput: unknown): EMDecision {
  switch (toolName) {
    case 'spawn_worker':
      return {
        type: 'spawn_worker',
        agentType: (toolInput as any).agentType,
        taskInput: (toolInput as any).taskInput,
      };
    case 'create_gate':
      return {
        type: 'create_gate',
        gateType: (toolInput as any).type,
        gateTitle: (toolInput as any).title,
        gateDescription: (toolInput as any).description,
      };
    case 'complete':
      return {
        type: 'complete',
        summary: (toolInput as any).summary,
      };
    case 'fail':
      return {
        type: 'fail',
        error: (toolInput as any).error,
      };
    default:
      throw new Error(`Unknown EM tool: ${toolName}`);
  }
}
```

---

## Phase 3: Worker Agents Refactor

Workers are fire-and-forget async functions using Claude Agent SDK. They save their own artifacts and terminate when done.

### 3.1 Worker Agent Implementation

```typescript
// server/orchestrator/workerAgent.ts

import { Claude } from '@anthropic-ai/claude-agent-sdk';
import { db } from '../db/client';
import { tasks, artifacts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { WorkerResult } from './types';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';

interface SpawnWorkerParams {
  taskId: string;
  runId: string;
  projectId: string;
  agentType: 'pm' | 'architect' | 'developer' | 'qa' | 'reviewer';
  input: Record<string, unknown>;
  cwd: string;
  onMessage: (message: string) => void;
  onComplete: (result: WorkerResult) => void;
}

const AGENT_PROMPTS: Record<string, string> = {
  pm: 'server/agents/pm.md',
  architect: 'server/agents/architect.md',
  developer: 'server/agents/developer.md',
  qa: 'server/agents/qa.md',
  reviewer: 'server/agents/reviewer.md',
};

/**
 * Spawns a worker agent in the background.
 * The agent runs to completion, saves its own artifacts, then terminates.
 * Completion is signaled via the onComplete callback.
 */
export function spawnWorkerAgent(params: SpawnWorkerParams): void {
  const { taskId, runId, projectId, agentType, input, cwd, onMessage, onComplete } = params;

  // Run in background - don't await
  runWorker(params)
    .then((result) => {
      onComplete(result);
    })
    .catch((error) => {
      onComplete({
        success: false,
        taskId,
        summary: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
}

async function runWorker(params: SpawnWorkerParams): Promise<WorkerResult> {
  const { taskId, runId, agentType, input, cwd, onMessage } = params;

  const systemPrompt = await fs.readFile(AGENT_PROMPTS[agentType], 'utf-8');

  // Create agent with Claude Agent SDK
  // SDK provides file, shell, and other tools automatically
  const agent = new Claude({
    model: 'claude-sonnet-4-20250514',
    systemPrompt,
    cwd,
    // Add our custom save_artifact tool
    tools: [createSaveArtifactTool(runId, taskId)],
    onMessage, // Stream thoughts to UI
  });

  // Run agent to completion
  const result = await agent.run(
    `Task input:\n${JSON.stringify(input, null, 2)}\n\nComplete this task, save any artifacts using save_artifact, then provide a brief summary of what you accomplished.`
  );

  // Update task status
  await db.update(tasks)
    .set({
      status: 'completed',
      output: JSON.stringify({ summary: result.text }),
      completedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  // Agent function returns - context is now gone
  return {
    success: true,
    taskId,
    summary: result.text,
  };
}

/**
 * Custom tool for workers to save artifacts to the database.
 * This is the ONLY custom tool we define - Claude Agent SDK provides the rest
 * (file read/write, shell, etc.)
 */
function createSaveArtifactTool(runId: string, taskId: string) {
  return {
    name: 'save_artifact',
    description: 'Save an artifact (spec, design, code reference, test report, review) to record your work.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['spec', 'design_doc', 'code_change', 'test_report', 'review', 'markdown'],
          description: 'The type of artifact',
        },
        title: {
          type: 'string',
          description: 'A short descriptive title',
        },
        content: {
          type: 'string',
          description: 'The artifact content (for specs, designs, reviews)',
        },
        filePath: {
          type: 'string',
          description: 'Path to a file you created/modified (for code changes)',
        },
      },
      required: ['type', 'title'],
    },
    handler: async (input: { type: string; title: string; content?: string; filePath?: string }) => {
      await db.insert(artifacts).values({
        id: randomUUID(),
        runId,
        taskId,
        type: input.type,
        title: input.title,
        content: input.content,
        filePath: input.filePath,
        createdAt: new Date(),
      });

      return { success: true, message: `Artifact "${input.title}" saved.` };
    },
  };
}
```

### 3.2 Worker Lifecycle

```
spawnWorkerAgent() called
    │
    ├── Starts runWorker() in background (no await)
    │   │
    │   ├── Creates Claude Agent SDK instance
    │   ├── Agent runs with SDK tools (file, shell) + save_artifact
    │   ├── Agent streams thoughts via onMessage callback
    │   ├── Agent saves artifacts via save_artifact tool
    │   ├── Agent completes and returns summary
    │   │
    │   ▼
    │   runWorker() returns WorkerResult
    │
    ▼
onComplete(result) called → pushes event to EM
    │
    ▼
Agent process terminates, context is gone
```

### 3.3 Update Worker Prompts

Update each agent prompt in `server/agents/` to remove MongoDB MCP references. Example for `server/agents/pm.md`:

```markdown
# Product Manager Agent

You analyze requirements and produce specifications.

## Your Task

1. Analyze the requirements provided
2. Research the codebase for context if needed
3. Create a detailed specification
4. Save the spec using `save_artifact`
5. Provide a brief summary of what you created

## Artifact Output

Use `save_artifact` with:
- type: 'spec'
- title: A descriptive title
- content: Your specification in markdown

## Specification Format

Include:
- Summary
- Goals
- User stories
- Acceptance criteria
- Out of scope
- Open questions (if requirements are unclear)

## Guidelines

- Be thorough but concise
- Flag ambiguities rather than making assumptions
- Reference existing code patterns when relevant
```

---

## Phase 4: Durability & Recovery

### 4.1 Session Persistence

```typescript
// server/orchestrator/sessionManager.ts

import { db } from '../db/client';
import { agentSessions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

interface SerializedSession {
  messages: Array<{ role: string; content: unknown }>;
  systemPrompt: string;
  model: string;
}

export async function saveSession(
  runId: string,
  agentType: string,
  session: SerializedSession
): Promise<string> {
  const existing = await db.select()
    .from(agentSessions)
    .where(and(
      eq(agentSessions.runId, runId),
      eq(agentSessions.agentType, agentType)
    ));

  if (existing.length > 0) {
    await db.update(agentSessions)
      .set({
        sessionData: JSON.stringify(session),
        updatedAt: new Date(),
      })
      .where(eq(agentSessions.id, existing[0].id));
    return existing[0].id;
  } else {
    const id = randomUUID();
    await db.insert(agentSessions).values({
      id,
      runId,
      agentType,
      sessionData: JSON.stringify(session),
      status: 'active',
    });
    return id;
  }
}

export async function loadSession(
  runId: string,
  agentType: string
): Promise<SerializedSession | null> {
  const [session] = await db.select()
    .from(agentSessions)
    .where(and(
      eq(agentSessions.runId, runId),
      eq(agentSessions.agentType, agentType)
    ));

  if (!session?.sessionData) return null;
  return JSON.parse(session.sessionData);
}
```

### 4.2 Startup Recovery

```typescript
// server/recovery.ts

import { db } from './db/client';
import { runs } from './db/schema';
import { eq, or } from 'drizzle-orm';
import { runEMAgent } from './orchestrator/emAgent';

export async function recoverInProgressRuns(): Promise<void> {
  // Find runs that were in progress when server stopped
  const inProgressRuns = await db.select()
    .from(runs)
    .where(or(
      eq(runs.status, 'running'),
      eq(runs.status, 'waiting_approval')
    ));

  console.log(`Found ${inProgressRuns.length} runs to recover`);

  for (const run of inProgressRuns) {
    console.log(`Recovering run ${run.id} (status: ${run.status}, step: ${run.currentStep})`);

    // For waiting_approval, just leave it - will resume when gate is resolved
    if (run.status === 'waiting_approval') {
      console.log(`Run ${run.id} waiting for approval, skipping`);
      continue;
    }

    // For running, resume the EM agent
    try {
      // Don't await - let it run in background
      runEMAgent({
        runId: run.id,
        projectId: run.projectId,
        cwd: await getProjectCwd(run.projectId),
        request: run.request || '',
      }).catch(err => {
        console.error(`Failed to recover run ${run.id}:`, err);
      });
    } catch (err) {
      console.error(`Failed to start recovery for run ${run.id}:`, err);
    }
  }
}
```

### 4.3 Add Recovery to Server Startup

```typescript
// server/index.ts (add to startup)

import { recoverInProgressRuns } from './recovery';

// After DB is ready
await recoverInProgressRuns();
```

---

## Phase 5: API & WebSocket Updates

### 5.1 New API Routes

```typescript
// server/routes/runs.ts

import { Router } from 'express';
import { db } from '../db/client';
import { projects, runs, tasks, artifacts, gates } from '../db/schema';
import { eq } from 'drizzle-orm';
import { runEMAgent } from '../orchestrator/emAgent';
import { randomUUID } from 'crypto';

const router = Router();

// Start a new run
router.post('/projects/:projectId/runs', async (req, res) => {
  const { projectId } = req.params;
  const { request } = req.body;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const runId = randomUUID();
  await db.insert(runs).values({
    id: runId,
    projectId,
    status: 'pending',
    request,
  });

  // Start EM agent (don't await)
  runEMAgent({
    runId,
    projectId,
    cwd: project.cwd || process.cwd(),
    request,
  }).catch(err => {
    console.error(`EM Agent failed for run ${runId}:`, err);
  });

  res.json({ runId, status: 'started' });
});

// Get run details
router.get('/runs/:runId', async (req, res) => {
  const { runId } = req.params;

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }

  const runTasks = await db.select().from(tasks).where(eq(tasks.runId, runId));
  const runArtifacts = await db.select().from(artifacts).where(eq(artifacts.runId, runId));
  const runGates = await db.select().from(gates).where(eq(gates.runId, runId));

  res.json({
    run,
    tasks: runTasks,
    artifacts: runArtifacts,
    gates: runGates,
  });
});

// Resolve a gate
router.post('/gates/:gateId/resolve', async (req, res) => {
  const { gateId } = req.params;
  const { status, resolution } = req.body; // status: 'approved' | 'rejected'

  await db.update(gates)
    .set({
      status,
      resolution: JSON.stringify(resolution),
      resolvedAt: new Date(),
    })
    .where(eq(gates.id, gateId));

  res.json({ success: true });
});

export default router;
```

### 5.2 WebSocket Broadcast Helper

```typescript
// server/websocket.ts

import { WebSocket, WebSocketServer } from 'ws';

interface Client {
  ws: WebSocket;
  projectId: string | null;
}

const clients = new Map<WebSocket, Client>();

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws) => {
    clients.set(ws, { ws, projectId: null });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'subscribe_project') {
          const client = clients.get(ws);
          if (client) {
            client.projectId = message.projectId;
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });
}

export function broadcastToProject(projectId: string, message: unknown): void {
  const payload = JSON.stringify(message);

  for (const [, client] of clients) {
    if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}
```

---

## Phase 6: Remove MongoDB

### 6.1 Files to Delete

- `server/db/mongo.ts`
- `server/db/changeStreamWatcher.ts` (or similar)
- Any MongoDB model files

### 6.2 Dependencies to Remove

```bash
npm uninstall mongodb @types/mongodb
```

### 6.3 Update .env

Remove `MONGODB_URI`, add (optional):
```
DATABASE_PATH=./data/mandu.db
```

---

## Phase 7: Update Client

Minimal changes needed - WebSocket message format stays similar.

### 7.1 Update Types

```typescript
// shared/types.ts

// Server → Client
export type ServerMessage =
  | { type: 'run_status'; runId: string; status: string; summary?: string; error?: string }
  | { type: 'task_started'; runId: string; taskId: string; agentType: string }
  | { type: 'task_completed'; runId: string; taskId: string; agentType: string; result: unknown }
  | { type: 'task_failed'; runId: string; taskId: string; agentType: string; error: string }
  | { type: 'agent_message'; runId: string; taskId: string; agentType: string; message: string }
  | { type: 'gate_created'; runId: string; gate: { id: string; type: string; title: string } }
  | { type: 'artifact_created'; runId: string; artifact: { id: string; type: string; title: string } };

// Client → Server
export type ClientMessage =
  | { type: 'subscribe_project'; projectId: string }
  | { type: 'unsubscribe_project' };
```

---

## Migration Checklist

### Preparation
- [ ] Review current MongoDB schema vs new SQLite schema
- [ ] Identify any data that needs migration (probably none for fresh start)

### Phase 1: SQLite Foundation
- [ ] Install dependencies (better-sqlite3, drizzle-orm, drizzle-kit)
- [ ] Create `server/db/schema.ts`
- [ ] Create `server/db/client.ts`
- [ ] Create migration script
- [ ] Add npm scripts for db:generate, db:migrate, db:reset
- [ ] Run initial migration
- [ ] Test basic CRUD operations

### Phase 2: EM Agent (Event-Driven)
- [ ] Create `server/orchestrator/types.ts` (EMDecision, EMEvent, WorkerResult)
- [ ] Create `server/orchestrator/emDecisionParser.ts` with EM tools
- [ ] Rewrite `server/orchestrator/emAgent.ts` with event loop
- [ ] Implement `pushEvent()` for workers/gates to notify EM
- [ ] Update `server/agents/em.md` system prompt
- [ ] Test EM spawning multiple workers in parallel
- [ ] Test EM conversation while workers run

### Phase 3: Worker Agents (Claude Agent SDK)
- [ ] Create `server/orchestrator/workerAgent.ts` with `spawnWorkerAgent()`
- [ ] Implement `save_artifact` custom tool (only custom tool needed)
- [ ] Update worker system prompts (pm.md, architect.md, etc.)
- [ ] Test worker saves artifact and terminates
- [ ] Test worker completion triggers EM event

### Phase 4: Durability
- [ ] Create `server/orchestrator/sessionManager.ts`
- [ ] Add session checkpointing to EM event loop
- [ ] Create `server/recovery.ts`
- [ ] Add recovery to server startup
- [ ] Test restart recovery (EM resumes, pending workers re-checked)

### Phase 5: API & WebSocket
- [ ] Create `server/routes/runs.ts`
- [ ] Create `server/websocket.ts` with `broadcastToProject()`
- [ ] Add gate resolution endpoint that calls `pushEvent()`
- [ ] Add user message endpoint that calls `pushEvent()`
- [ ] Update `server/index.ts` with new routes
- [ ] Test API endpoints
- [ ] Test WebSocket broadcasts

### Phase 6: Remove MongoDB
- [ ] Delete `server/db/mongo.ts`
- [ ] Delete change stream watcher
- [ ] Remove mongodb dependencies
- [ ] Update .env.example
- [ ] Update README

### Phase 7: Client Updates
- [ ] Update shared/types.ts
- [ ] Update useWebSocket hook if needed
- [ ] Test full flow end-to-end

### Final
- [ ] Test: Start run, spawn PM, chat with EM while PM works
- [ ] Test: Spawn multiple developers in parallel
- [ ] Test: Gate approval triggers EM continuation
- [ ] Test: Server restart recovers in-progress run
- [ ] Update documentation
- [ ] Clean up dead code
