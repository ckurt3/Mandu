# Mandu

Your dev team. Wrapped in one.

A multi-agent orchestration system using Claude Agent SDK with MongoDB for coordination.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with your MongoDB connection:
```bash
cp .env.example .env
# Edit .env with your MongoDB Atlas connection string
```

## Development

```bash
# Run both server and client (with hot reload)
npm run dev

# Run just the server
npm run dev:server

# Run just the frontend (Vite)
npm run dev:client
```

- **Server**: http://localhost:3000 (Express + WebSocket)
- **Client (dev)**: http://localhost:5173 (Vite with hot reload, proxies to server)

## Production

```bash
# Build both client and server
npm run build

# Start production server
npm start
```

## Project Structure

```
mandu/
├── server/           # Express + WebSocket backend
│   ├── index.ts      # Entry point
│   ├── db/           # MongoDB connection and models
│   └── wsHandler.ts  # WebSocket message handling
├── client/           # React frontend (Vite)
│   └── src/
├── shared/           # Shared types
└── .env              # Environment variables (not in git)
```
