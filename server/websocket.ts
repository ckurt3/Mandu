import { WebSocket, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { db } from './db/client.js';
import { timelineEvents } from './db/schema.js';

interface Client {
  ws: WebSocket;
  projectId: string | null;
}

const clients = new Map<WebSocket, Client>();

export function setupWebSocket(
  wss: WebSocketServer,
  onMessage: (ws: WebSocket, message: unknown) => void
): void {
  wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.set(ws, { ws, projectId: null });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        onMessage(ws, message);
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      clients.delete(ws);
    });
  });
}

export function setClientSubscription(ws: WebSocket, projectId: string | null): void {
  const client = clients.get(ws);
  if (client) {
    client.projectId = projectId;
  }
}

export function sendToClient(ws: WebSocket, message: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function broadcastToProject(projectId: string, message: unknown): void {
  const msg = message as { type?: string; isPartial?: boolean };
  const payload = JSON.stringify(message);
  let sentCount = 0;

  // Only persist non-partial messages to timeline
  if (!msg.isPartial) {
    try {
      db.insert(timelineEvents).values({
        id: randomUUID(),
        projectId,
        type: msg.type || 'unknown',
        payload,
        createdAt: new Date(),
      }).run();
    } catch (err) {
      console.error('Timeline persist error:', err);
    }
  }

  // Broadcast to clients
  for (const [, client] of clients) {
    if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
      sentCount++;
    }
  }

  const msgType = msg.type || 'unknown';
  if (sentCount === 0 && msgType === 'agent_message') {
    console.log(`[WS] No clients subscribed to project ${projectId.slice(0, 8)}... (${clients.size} total clients)`);
  }
}

export function broadcastToAll(message: unknown): void {
  const payload = JSON.stringify(message);

  for (const [, client] of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

export function getSubscribedClients(projectId: string): Client[] {
  const result: Client[] = [];
  for (const [, client] of clients) {
    if (client.projectId === projectId) {
      result.push(client);
    }
  }
  return result;
}
