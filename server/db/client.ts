import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(DATA_DIR, 'mandu.db');

const sqlite: DatabaseType = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };

// Check if DB needs initialization
export function needsInit(): boolean {
  const result = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
  ).get();
  return !result;
}

export function closeDb(): void {
  sqlite.close();
}
