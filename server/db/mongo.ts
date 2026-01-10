import { MongoClient, Db, Collection } from 'mongodb';
import type { Project, Task, Gate, Artifact, AgentSessionDoc } from './models.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export interface Collections {
  projects: Collection<Project>;
  tasks: Collection<Task>;
  gates: Collection<Gate>;
  artifacts: Collection<Artifact>;
  agentSessions: Collection<AgentSessionDoc>;
}

export async function connectToMongo(): Promise<Collections> {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_CONNECTION_STRING;

  if (!uri) {
    throw new Error('MONGODB_URI or MONGODB_CONNECTION_STRING environment variable is not set');
  }

  if (client && db) {
    return getCollections();
  }

  console.log('Connecting to MongoDB...');
  client = new MongoClient(uri);
  await client.connect();

  db = client.db('mandu');
  console.log('Connected to MongoDB database: mandu');

  // Create indexes
  await createIndexes();

  return getCollections();
}

export function getCollections(): Collections {
  if (!db) {
    throw new Error('Database not connected');
  }

  return {
    projects: db.collection<Project>('projects'),
    tasks: db.collection<Task>('tasks'),
    gates: db.collection<Gate>('gates'),
    artifacts: db.collection<Artifact>('artifacts'),
    agentSessions: db.collection<AgentSessionDoc>('agentSessions'),
  };
}

async function createIndexes(): Promise<void> {
  if (!db) return;

  // Projects: index on status for filtering active projects
  await db.collection('projects').createIndex({ status: 1 });

  // Tasks: index on projectId and status for listing
  await db.collection('tasks').createIndex({ projectId: 1, status: 1 });
  await db.collection('tasks').createIndex({ assignedAgent: 1 });

  // Gates: index on projectId and status for pending gates
  await db.collection('gates').createIndex({ projectId: 1, status: 1 });
  await db.collection('gates').createIndex({ taskId: 1 });

  // Artifacts: index on taskId for listing artifacts per task
  await db.collection('artifacts').createIndex({ taskId: 1 });
  await db.collection('artifacts').createIndex({ projectId: 1 });

  // AgentSessions: index on agentId for quick lookup
  await db.collection('agentSessions').createIndex({ agentId: 1 }, { unique: true });
  await db.collection('agentSessions').createIndex({ projectId: 1 });

  console.log('MongoDB indexes created');
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectToMongo() first.');
  }
  return db;
}

export function getClient(): MongoClient {
  if (!client) {
    throw new Error('Client not connected. Call connectToMongo() first.');
  }
  return client;
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed');
  }
}
