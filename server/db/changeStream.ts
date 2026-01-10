import { ChangeStream, ChangeStreamDocument } from 'mongodb';
import { getDb } from './mongo.js';
import type { Project, Task, Gate, Artifact } from './models.js';

type CollectionName = 'projects' | 'tasks' | 'gates' | 'artifacts';
type OperationType = 'insert' | 'update' | 'delete' | 'replace';

export interface ChangeEvent {
  collection: CollectionName;
  operation: OperationType;
  documentId: string;
  document?: Project | Task | Gate | Artifact;
  projectId?: string;
}

type ChangeEventCallback = (event: ChangeEvent) => void;

const WATCHED_COLLECTIONS: CollectionName[] = ['projects', 'tasks', 'gates', 'artifacts'];

export class ChangeStreamWatcher {
  private streams: ChangeStream[] = [];
  private callbacks: ChangeEventCallback[] = [];
  private running = false;

  subscribe(callback: ChangeEventCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  private emit(event: ChangeEvent): void {
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in change stream callback:', error);
      }
    }
  }

  async start(): Promise<void> {
    if (this.running) return;

    const db = getDb();
    this.running = true;

    for (const collectionName of WATCHED_COLLECTIONS) {
      const collection = db.collection(collectionName);

      // Watch with fullDocument to get the complete document on updates
      const stream = collection.watch([], {
        fullDocument: 'updateLookup'
      });

      stream.on('change', (change: ChangeStreamDocument) => {
        this.handleChange(collectionName, change);
      });

      stream.on('error', (error) => {
        console.error(`Change stream error for ${collectionName}:`, error);
      });

      this.streams.push(stream);
      console.log(`Watching change stream for: ${collectionName}`);
    }
  }

  private handleChange(collection: CollectionName, change: ChangeStreamDocument): void {
    let operation: OperationType;
    let document: Project | Task | Gate | Artifact | undefined;
    let documentId: string;
    let projectId: string | undefined;

    switch (change.operationType) {
      case 'insert':
        operation = 'insert';
        document = change.fullDocument as Project | Task | Gate | Artifact;
        documentId = change.documentKey._id.toString();
        break;

      case 'update':
      case 'replace':
        operation = change.operationType === 'update' ? 'update' : 'replace';
        document = change.fullDocument as Project | Task | Gate | Artifact | undefined;
        documentId = change.documentKey._id.toString();
        break;

      case 'delete':
        operation = 'delete';
        documentId = change.documentKey._id.toString();
        break;

      default:
        return;
    }

    // Convert ObjectIds to strings for JSON serialization
    if (document) {
      // Convert _id to string
      if (document._id) {
        (document as { _id: unknown })._id = document._id.toString();
      }
      // Convert projectId to string if present
      if ('projectId' in document && document.projectId) {
        (document as { projectId: unknown }).projectId = document.projectId.toString();
      }
      // Convert taskId to string if present
      if ('taskId' in document && (document as { taskId?: unknown }).taskId) {
        (document as { taskId: unknown }).taskId = (document as { taskId: { toString(): string } }).taskId.toString();
      }
    }

    // Extract projectId for routing
    if (document) {
      if (collection === 'projects') {
        projectId = documentId;
      } else if ('projectId' in document && document.projectId) {
        projectId = String(document.projectId);
      }
    }

    this.emit({
      collection,
      operation,
      documentId,
      document,
      projectId
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const stream of this.streams) {
      await stream.close();
    }
    this.streams = [];
    console.log('Change stream watchers stopped');
  }
}

// Singleton instance
let watcher: ChangeStreamWatcher | null = null;

export function getChangeStreamWatcher(): ChangeStreamWatcher {
  if (!watcher) {
    watcher = new ChangeStreamWatcher();
  }
  return watcher;
}
