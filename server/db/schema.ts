import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Workspaces table - represents a local directory where projects are created
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  status: text('status').default('idle'), // idle, running, waiting_approval, completed, failed
  emSessionId: text('em_session_id'), // Reference to EM's agent session
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => [
  index('idx_projects_status').on(table.status),
  index('idx_projects_workspace').on(table.workspaceId),
]);

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  agentType: text('agent_type').notNull(), // pm, architect, developer, qa, reviewer
  title: text('title').notNull(),
  input: text('input'), // JSON - what the agent received
  output: text('output'), // JSON - what the agent returned
  status: text('status').default('pending'), // pending, running, completed, failed
  error: text('error'), // Error message if failed
  attempts: integer('attempts').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (table) => [
  index('idx_tasks_project').on(table.projectId),
  index('idx_tasks_status').on(table.status),
]);

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  taskId: text('task_id').references(() => tasks.id),
  type: text('type').notNull(), // spec, design_doc, code_change, test_report, review, markdown
  title: text('title').notNull(),
  content: text('content'), // For inline content
  filePath: text('file_path'), // For file references
  metadata: text('metadata'), // JSON - language, line count, etc.
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => [
  index('idx_artifacts_project').on(table.projectId),
]);

export const gates = sqliteTable('gates', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  type: text('type').notNull(), // approval, clarification, review
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('pending'), // pending, approved, rejected
  requestedAt: integer('requested_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  resolvedBy: text('resolved_by'),
  resolution: text('resolution'), // JSON - approval notes, clarification response, etc.
}, (table) => [
  index('idx_gates_project').on(table.projectId),
  index('idx_gates_status').on(table.status),
]);

export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  agentType: text('agent_type').notNull(), // em, pm, architect, developer, qa, reviewer
  sessionData: text('session_data'), // JSON - serialized Claude session
  status: text('status').default('active'), // active, paused, completed
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const timelineEvents = sqliteTable('timeline_events', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  type: text('type').notNull(), // WebSocket message type
  payload: text('payload').notNull(), // Full message as JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => [
  index('idx_timeline_project').on(table.projectId),
  index('idx_timeline_created').on(table.createdAt),
]);

// Type exports for use in application code
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type Gate = typeof gates.$inferSelect;
export type NewGate = typeof gates.$inferInsert;
export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type NewTimelineEvent = typeof timelineEvents.$inferInsert;
