# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mandu is a multi-agent orchestration system that simulates a development team using Claude Agent SDK with SQLite for persistence. The tagline: "Your dev team. All wrapped together."

## Development Commands

```bash
npm run dev          # Run both server and client with hot reload
npm run dev:server   # Server only (tsx watch)
npm run dev:client   # Client only (Vite)
npm run build        # Build both client and server
npm start            # Run production server
```

- **Server**: http://localhost:3000 (Express + WebSocket)
- **Client (dev)**: http://localhost:5173 (Vite, proxies to server)

---

## Quick Reference (READ THIS FIRST)

### Key Files by Task

| Task | Files to Modify |
|------|-----------------|
| Add WebSocket message type | `shared/types.ts` → `server/index.ts:handleMessage()` → `client/src/hooks/useWebSocket.ts` |
| Add EM orchestration tool | `server/orchestrator/emAgent.ts:createEMMcpServer()` |
| Add worker tool | `server/orchestrator/workerTools.ts:createWorkerMcpServer()` |
| Modify EM decision logic | `server/orchestrator/emAgent.ts` (loop + decisions) |
| Add new agent type | `server/agents/*.md` (prompt) → `shared/types.ts:AgentType` → `server/orchestrator/workerAgent.ts:AGENT_PROMPT_PATHS` |
| Add database table | `server/db/schema.ts` → run `npx drizzle-kit push` |
| Add UI component | `client/src/components/` → import in parent |
| Modify chat UI | `client/src/components/TeamChat/` |
| Modify artifact viewer | `client/src/components/CenterPane/` |

### Entry Points

| What | Location |
|------|----------|
| Server startup | `server/index.ts:start()` (line ~300) |
| WebSocket handler | `server/index.ts:handleMessage()` (line ~30) |
| EM event loop | `server/orchestrator/emAgent.ts:runEMAgent()` (line ~633) |
| Worker execution | `server/orchestrator/workerAgent.ts:runWorker()` (line ~92) |
| Client app root | `client/src/App.tsx` |
| WebSocket client | `client/src/hooks/useWebSocket.ts` |

### Types Location

All shared types in `shared/types.ts`:
- `ClientMessage` / `ServerMessage` — WebSocket message unions (discriminated on `type` field)
- `AgentType` — `'em' | 'pm' | 'architect' | 'developer' | 'qa' | 'reviewer'`
- `TaskStatus` — `'pending' | 'running' | 'completed' | 'failed'`
- `GateStatus` — `'pending' | 'approved' | 'rejected'`
- `ProjectStatus` — `'idle' | 'running' | 'waiting_approval' | 'completed' | 'failed'`
- `Project`, `Task`, `Gate`, `Artifact`, `ChatMessage`, `AgentState` — domain models

Database types in `server/db/schema.ts`:
- `Project`, `Task`, `Gate`, `Artifact`, `AgentSession`, `TimelineEvent` — Drizzle inferred types

---

## File Inventory

### Server (`server/`)

| File | Purpose |
|------|---------|
| `index.ts` | Express server, WebSocket setup, main message handler |
| `websocket.ts` | WebSocket utilities: `broadcastToProject()`, `sendToClient()`, client subscription tracking |
| `recovery.ts` | Recover in-progress projects on server restart |
| `validation.ts` | Zod schemas for validating WebSocket messages |
| `db/client.ts` | SQLite connection via better-sqlite3 |
| `db/schema.ts` | Drizzle ORM schema definitions |
| `orchestrator/emAgent.ts` | **Core EM logic**: event loop, MCP tools (spawn_worker, create_gate, complete, fail), session management |
| `orchestrator/workerAgent.ts` | Worker agent execution: loads prompts, runs SDK query, broadcasts messages |
| `orchestrator/workerTools.ts` | MCP tools for workers: `create_artifact` |
| `orchestrator/types.ts` | Internal types: `EMDecision`, `EMEvent`, `ProjectContext`, `SpawnWorkerParams` |
| `agents/*.md` | System prompts for each agent type |

### Client (`client/src/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Root component: layout, project list, modals |
| `hooks/useWebSocket.ts` | WebSocket connection, message handling, state management |
| `hooks/useTheme.ts` | Dark/light theme toggle |
| `contexts/ThemeContext.tsx` | Theme provider |
| `contexts/ArtifactsContext.tsx` | Selected artifact state |
| `components/TeamChat/index.tsx` | Main chat component |
| `components/TeamChat/components/*.tsx` | Chat subcomponents (MessageGroup, ChatInput, ToolCard, etc.) |
| `components/CenterPane/index.tsx` | Center pane layout |
| `components/CenterPane/ArtifactViewer.tsx` | Artifact display with markdown/code rendering |
| `components/SlideMenu.tsx` | Left sidebar (project list) |
| `components/RightPane.tsx` | Right sidebar (team chat) |
| `components/GateCard.tsx` | Approval gate UI |

---

## Architecture

### Multi-Agent System

The core concept is a team of specialized AI agents that coordinate via an Engineering Manager (EM):

- **Engineering Manager (EM)** — Orchestrates the team, spawns workers, manages approval gates
- **Product Manager (PM)** — Requirements gathering, specifications
- **Architect** — System design, technical decisions
- **Developer** — Implementation, code changes
- **QA** — Testing, validation
- **Reviewer** — Code review, feedback

Agent prompts: `server/agents/` (em.md, pm.md, architect.md, developer.md, qa.md, reviewer.md)

### EM Decision Flow

```
User Message → EM receives event → EM calls tool → Execute decision → Wait for next event
                     ↑                                    |
                     └────────────────────────────────────┘
                       (worker_completed, gate_resolved)
```

EM tools (defined in `emAgent.ts:createEMMcpServer()`):
- `spawn_worker` — Delegate to pm/architect/developer/qa/reviewer
- `create_gate` — Request human approval/clarification/review
- `complete` — Mark project done
- `fail` — Mark project failed

### Data Flow

```
Client                          Server
  │                               │
  │── send_project_message ──────>│
  │                               │── handleMessage()
  │                               │── runEMAgent() / sendMessageToEM()
  │                               │     │
  │                               │     └── runEMTurn() → SDK query
  │                               │           │
  │<── agent_message (streaming) ─│<──────────┘
  │                               │
  │                               │── executeDecision()
  │                               │     │
  │                               │     └── spawnWorkerAgent() (background)
  │<── task_started ──────────────│           │
  │<── agent_message (worker) ────│<──────────┘
  │<── task_completed ────────────│
  │                               │
  │                               │── pushEvent() to EM
  │                               │     └── EM loop continues...
```

### Key Patterns

1. **Event-Driven EM** — Uses Node.js `EventEmitter` per project. Workers/gates push events via `pushEvent()`.
2. **Fire-and-Forget Workers** — `spawnWorkerAgent()` runs in background, calls `onComplete` callback when done.
3. **Session Persistence** — EM session ID stored in `agent_sessions` table; SDK handles conversation history.
4. **Timeline Persistence** — All non-partial WebSocket messages saved to `timeline_events` for replay on reconnect.
5. **Discriminated Unions** — All WebSocket messages have `type` field for switching.

### Database Schema

```
projects          tasks              gates              artifacts
├─ id (PK)        ├─ id (PK)         ├─ id (PK)         ├─ id (PK)
├─ name           ├─ projectId (FK)  ├─ projectId (FK)  ├─ projectId (FK)
├─ description    ├─ agentType       ├─ type            ├─ taskId (FK)
├─ cwd            ├─ title           ├─ title           ├─ type
├─ status         ├─ input (JSON)    ├─ description     ├─ title
├─ emSessionId    ├─ output (JSON)   ├─ status          ├─ content
└─ timestamps     ├─ status          ├─ resolution      ├─ filePath
                  └─ timestamps      └─ timestamps      └─ metadata (JSON)

agent_sessions                timeline_events
├─ id (PK)                    ├─ id (PK)
├─ projectId (FK)             ├─ projectId (FK)
├─ agentType                  ├─ type
├─ sessionData (JSON)         ├─ payload (JSON)
├─ status                     └─ createdAt
└─ timestamps
```

---

## Common Modifications

### Adding a New WebSocket Message

1. **Define types** in `shared/types.ts`:
   ```typescript
   // Client → Server
   export interface MyNewMessage {
     type: 'my_new_message';
     someField: string;
   }
   // Add to ClientMessage union

   // Server → Client
   export interface MyNewResponseMessage {
     type: 'my_new_response';
     data: unknown;
   }
   // Add to ServerMessage union
   ```

2. **Handle on server** in `server/index.ts:handleMessage()`:
   ```typescript
   case 'my_new_message': {
     // Handle message
     sendToClient(ws, { type: 'my_new_response', data: result });
     break;
   }
   ```

3. **Send from client** in `client/src/hooks/useWebSocket.ts`:
   ```typescript
   const sendMyNewMessage = useCallback((someField: string) => {
     send({ type: 'my_new_message', someField });
   }, [send]);
   ```

### Adding an EM Tool

In `server/orchestrator/emAgent.ts:createEMMcpServer()`:

```typescript
tool(
  'my_tool',
  'Description of what this tool does',
  {
    param1: z.string().describe('What this param is for'),
  },
  async (args) => {
    onDecision({
      type: 'my_tool',
      // ... capture decision data
    });
    return {
      content: [{ type: 'text', text: 'Tool result message' }]
    };
  }
),
```

Then handle in `executeDecision()`.

### Adding a Worker Tool

In `server/orchestrator/workerTools.ts:createWorkerMcpServer()`:

```typescript
tool(
  'my_worker_tool',
  'Description',
  { param: z.string() },
  async (args) => {
    // Do something
    return { content: [{ type: 'text', text: 'Result' }] };
  }
),
```

---

## Setup

Database auto-created at `./data/mandu.db` on first run. No external services required.

Optional `.env`:
```bash
DATABASE_PATH=./data/mandu.db
PORT=3000
ANTHROPIC_API_KEY=sk-...  # Required for Claude SDK
```
