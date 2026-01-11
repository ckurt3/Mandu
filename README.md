# Mandu

Your dev team. All wrapped together.

A multi-agent orchestration system built with the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) and MongoDB. Mandu coordinates a team of specialized AI agents to handle software development tasks—from requirements to pull request.

## How It Works

You chat with an **Engineering Manager (EM)** agent who orchestrates a team of specialists:

| Agent | Role |
|-------|------|
| **PM** | Writes specs and requirements |
| **Architect** | Designs technical solutions |
| **Developer** | Implements code changes |
| **QA** | Tests and validates |
| **Reviewer** | Reviews code quality |
| **Release Manager** | Creates pull requests via GitHub |

The EM delegates work by creating tasks in MongoDB. The system automatically spawns the appropriate agent when a task is created.

### Gates (Human-in-the-Loop)

Three required approval checkpoints keep you in control:

1. **After PM** — Approve the spec before architecture begins
2. **After Architect** — Approve the design before implementation
3. **Before Release** — Final code review before PR creation

## MCP Integrations

Mandu uses [Model Context Protocol](https://modelcontextprotocol.io/) servers:

- **MongoDB** — Agent coordination, task management, artifacts
- **Linear** — Create projects from Linear issues, sync with your backlog
- **GitHub** — Push code, create branches and pull requests

## Setup

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- Anthropic API key (for Claude Agent SDK)

### Installation

```bash
# Clone the repo
git clone https://github.com/ckurt3/Mandu.git
cd Mandu

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Configuration

Edit `.env` with your credentials:

```bash
# Required
MONGODB_URI=mongodb+srv://...
MDB_MCP_CONNECTION_STRING=mongodb+srv://...

# Optional - for Linear integration
LINEAR_API_KEY=lin_api_...

# Optional - for GitHub integration
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
```

Create `.mcp.json` for MCP server configuration:

```json
{
  "mcpServers": {
    "mongodb": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mongodb-mcp-server"],
      "env": {
        "MDB_MCP_CONNECTION_STRING": "${MDB_MCP_CONNECTION_STRING}"
      }
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    },
    "linear": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp",
      "headers": {
        "Authorization": "Bearer ${LINEAR_API_KEY}"
      }
    }
  }
}
```

## Development

```bash
# Run both server and client with hot reload
npm run dev

# Or run separately
npm run dev:server   # Express + WebSocket on :3000
npm run dev:client   # Vite on :5173 (proxies to server)
```

## Production

```bash
npm run build
npm start
```

Server runs on http://localhost:3000

## Project Structure

```
mandu/
├── server/
│   ├── index.ts           # Express + WebSocket entry
│   ├── sessionManager.ts  # Claude Agent SDK sessions
│   ├── orchestrator/
│   │   └── emAgent.ts     # Engineering Manager setup
│   ├── agents/
│   │   ├── em.md          # EM system prompt
│   │   └── worker.md      # Worker agent prompts
│   └── db/
│       ├── mongo.ts       # MongoDB connection
│       └── models.ts      # Collection types
├── client/
│   └── src/
│       ├── App.tsx        # Main app with project management
│       ├── components/
│       │   └── TeamChat.tsx  # Chat interface
│       └── hooks/
│           └── useWebSocket.ts
├── shared/
│   └── types.ts           # Shared WebSocket message types
└── .env                   # Environment variables (git ignored)
```

## Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: React, Vite, Tailwind CSS
- **AI**: Claude Agent SDK, Anthropic API
- **Database**: MongoDB Atlas
- **Integrations**: Linear MCP, GitHub MCP

## License

MIT

---

Built for the MongoDB AI Agents Hackathon
