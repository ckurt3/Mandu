# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mandu is a multi-agent orchestration system that simulates a development team using Claude Agent SDK with MongoDB for coordination. The tagline: "Your dev team. All wrapped together."

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

- **Engineering Manager (EM)** - Orchestrates the team, creates tasks, manages approval gates
- **Product Manager (PM)** - Requirements gathering, specifications
- **Architect** - System design, technical decisions
- **Developer** - Implementation, code changes
- **QA** - Testing, validation
- **Reviewer** - Code review, feedback

Agent prompts are stored as markdown files in `server/agents/` (em.md, pm.md, architect.md, etc.).

### Key Design Patterns

1. **Agent Delegation** - EM creates tasks via MongoDB MCP, worker agents execute independently
2. **Real-Time Sync** - MongoDB change streams + WebSocket broadcast to connected clients
3. **Session Persistence** - Claude SDK sessions saved to MongoDB for agent resumption
4. **MongoDB MCP** - Agents interact with database directly via MongoDB MCP tools (insert-many, find, update-many)
5. **Project Scoping** - All work happens within a project context; clients subscribe to project updates
6. **Change Stream Triggers** - When tasks are inserted with status "pending", worker agents are automatically spawned

### Tech Stack

- **Backend**: Express.js + WebSocket (ws) + TypeScript
- **Frontend**: React 19 + Vite + TypeScript
- **Database**: MongoDB via MCP server
- **AI**: Claude Agent SDK (@anthropic-ai/claude-agent-sdk)

### Directory Structure

- `server/` - Express backend with agent orchestration
  - `agents/` - Agent system prompts (markdown files)
  - `db/` - MongoDB connection, models, change stream watcher
  - `orchestrator/` - EM and worker agent implementations
- `client/` - React frontend
  - `components/` - UI components (TeamChat, GateCard, etc.)
  - `hooks/useWebSocket.ts` - WebSocket client connection
- `shared/types.ts` - WebSocket message types shared between client/server

### Database Collections

- **projects** - Work containers (name, description, cwd, status, emAgentId)
- **tasks** - Work items assigned to agents (title, assignedAgent, status, result)
- **gates** - Approval checkpoints requiring human review
- **artifacts** - Agent output (spec, design_doc, code_change, test_report, markdown)
- **agentSessions** - Persisted Claude SDK sessions

### Communication Flow

WebSocket messages defined in `shared/types.ts`:
- Client → Server: create_agent, send_message, subscribe_project, resolve_gate, etc.
- Server → Client: agent_message, agent_status, db_change, project_subscribed, etc.

## Agent Constraints

When running as an agent in this system:

### Engineering Manager (EM)
- ONLY use `mcp__mongodb__*` tools - never read files or run shell commands directly
- Insert tasks into `tasks` collection to delegate work (workers spawn automatically)
- Insert gates into `gates` collection to request human approval
- Your job is orchestration, not execution

### Worker Agents (PM, Architect, Developer, QA, Reviewer)
- Complete your assigned task and update its status to "completed" via MongoDB
- Insert artifacts into `artifacts` collection for deliverables
- Stay focused on your assigned task scope

### All Agents
- Keep responses concise and action-oriented
- Report progress clearly
- Use MongoDB MCP tools (find, insert-many, update-many) for all database operations

## Setup

Requires a `.env` file with MongoDB connection string (see `.env.example`).
