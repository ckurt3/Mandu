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

## Architecture

### Multi-Agent System

The core concept is a team of specialized AI agents that coordinate via an Engineering Manager (EM):

- **Engineering Manager (EM)** - Orchestrates the team, spawns workers, manages approval gates
- **Product Manager (PM)** - Requirements gathering, specifications
- **Architect** - System design, technical decisions
- **Developer** - Implementation, code changes
- **QA** - Testing, validation
- **Reviewer** - Code review, feedback

Agent prompts are stored as markdown files in `server/agents/` (em.md, pm.md, architect.md, etc.).

### Key Design Patterns

1. **Event-Driven EM** - EM runs in a loop, receiving events (user messages, worker completions, gate resolutions) and making decisions
2. **Direct Orchestration** - EM spawns worker agents directly via function calls, no external triggers needed
3. **Session Persistence** - Agent sessions persisted to SQLite for recovery after restart
4. **Run-Based Workflow** - Each user request creates a "run" that groups related tasks, gates, and artifacts
5. **Project Scoping** - All work happens within a project context; clients subscribe to project updates
6. **WebSocket Broadcast** - Real-time updates pushed to connected clients

### Tech Stack

- **Backend**: Express.js + WebSocket (ws) + TypeScript
- **Frontend**: React 19 + Vite + TypeScript
- **Database**: SQLite (better-sqlite3 + Drizzle ORM)
- **AI**: Claude Agent SDK (@anthropic-ai/claude-agent-sdk)

### Directory Structure

- `server/` - Express backend with agent orchestration
  - `agents/` - Agent system prompts (markdown files)
  - `db/` - SQLite connection (client.ts), Drizzle schema (schema.ts)
  - `orchestrator/` - EM event loop (emAgent.ts), worker spawning (workerAgent.ts)
- `client/` - React frontend
  - `components/` - UI components (TeamChat, GateCard, etc.)
  - `hooks/useWebSocket.ts` - WebSocket client connection
- `shared/types.ts` - WebSocket message types shared between client/server

### Database Tables

- **projects** - Work containers (name, description, cwd, status)
- **runs** - Execution contexts for a project (status, current step)
- **tasks** - Work items assigned to agents (agentType, input, output, status)
- **gates** - Approval checkpoints requiring human review (type, title, status)
- **artifacts** - Agent output (type, title, content, filePath)
- **agent_sessions** - Persisted Claude SDK session data

### Communication Flow

WebSocket messages defined in `shared/types.ts`:
- Client → Server: create_project, subscribe_project, send_project_message, resolve_gate
- Server → Client: projects_list, project_subscribed, run_status, agent_message, gate_created, artifact_created

## EM Decision Flow

The Engineering Manager uses an event-driven architecture:

1. **Receive Event** - User message, worker completion, or gate resolution
2. **Make Decision** - Based on context, decide next action:
   - `spawn_worker` - Delegate to a specialist agent
   - `create_gate` - Request human approval
   - `complete` - Mark run as successfully completed
   - `fail` - Mark run as failed
3. **Execute** - Carry out the decision (spawn agent, insert gate, etc.)
4. **Wait** - Listen for next event

Workers run independently and report back via the `onComplete` callback, which pushes an event to the EM.

## Setup

The database is automatically created at `./data/mandu.db` on first run. No external services required.

Optional `.env` configuration:
```bash
DATABASE_PATH=./data/mandu.db  # Custom database location
PORT=3000                       # Server port
```
