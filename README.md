# Mandu

Your dev team. All wrapped together.

A multi-agent orchestration system built with the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk). Mandu coordinates a team of specialized AI agents to handle software development tasks—from requirements to pull request.

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

The EM delegates work by spawning worker agents. All state is persisted locally in SQLite—no external database required.

### Gates (Human-in-the-Loop)

Three required approval checkpoints keep you in control:

1. **After PM** — Approve the spec before architecture begins
2. **After Architect** — Approve the design before implementation
3. **Before Release** — Final code review before PR creation

## MCP Integrations

Mandu uses [Model Context Protocol](https://modelcontextprotocol.io/) servers for external integrations:

- **Linear** — Create projects from Linear issues, sync with your backlog
- **GitHub** — Push code, create branches and pull requests

## Setup

### Prerequisites

- Node.js 18+
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

Edit `.env` if you need custom settings:

```bash
# Optional: Custom database path (defaults to ./data/mandu.db)
# DATABASE_PATH=./data/mandu.db

# Optional: Server port (defaults to 3000)
# PORT=3000
```

For MCP integrations (Linear, GitHub), create `.mcp.json`:

```json
{
  "mcpServers": {
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

## Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: React, Vite, Tailwind CSS
- **AI**: Claude Agent SDK, Anthropic API
- **Database**: SQLite (better-sqlite3 + Drizzle ORM)
- **Integrations**: Linear MCP, GitHub MCP

## License

**MIT**
