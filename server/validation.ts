import { z } from 'zod';

// Client -> Server message schemas
const subscribeProjectSchema = z.object({
  type: z.literal('subscribe_project'),
  projectId: z.string().min(1),
});

const unsubscribeProjectSchema = z.object({
  type: z.literal('unsubscribe_project'),
});

const createProjectSchema = z.object({
  type: z.literal('create_project'),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  cwd: z.string().optional(),
  workspaceId: z.string().optional(),
  linearIssueKey: z.string().optional(),
});

const listProjectsSchema = z.object({
  type: z.literal('list_projects'),
});

const messagePayloadSchema = z.union([
  z.string(),
  z.object({
    text: z.string().optional(),
    images: z.array(z.string()).optional(),
    pdfs: z.array(z.object({
      name: z.string(),
      dataUrl: z.string(),
    })).optional(),
    textFiles: z.array(z.object({
      name: z.string(),
      content: z.string(),
    })).optional(),
  }),
]);

const sendProjectMessageSchema = z.object({
  type: z.literal('send_project_message'),
  projectId: z.string().min(1),
  message: messagePayloadSchema,
});

const resolveGateSchema = z.object({
  type: z.literal('resolve_gate'),
  gateId: z.string().min(1),
  status: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
});

// Workspace message schemas
const listWorkspacesSchema = z.object({
  type: z.literal('list_workspaces'),
});

const createWorkspaceSchema = z.object({
  type: z.literal('create_workspace'),
  name: z.string().min(1),
  path: z.string().min(1),
});

const deleteWorkspaceSchema = z.object({
  type: z.literal('delete_workspace'),
  workspaceId: z.string().min(1),
});

// Agent control message schemas
const pauseAgentSchema = z.object({
  type: z.literal('pause_agent'),
  projectId: z.string().min(1),
  taskId: z.string().min(1),
});

const resumeAgentSchema = z.object({
  type: z.literal('resume_agent'),
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  message: z.string().optional(),
});

const sendAgentMessageSchema = z.object({
  type: z.literal('send_agent_message'),
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  message: z.string().min(1),
});

// Union of all client message types
export const clientMessageSchema = z.discriminatedUnion('type', [
  subscribeProjectSchema,
  unsubscribeProjectSchema,
  createProjectSchema,
  listProjectsSchema,
  sendProjectMessageSchema,
  resolveGateSchema,
  listWorkspacesSchema,
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  pauseAgentSchema,
  resumeAgentSchema,
  sendAgentMessageSchema,
]);

export type ValidatedClientMessage = z.infer<typeof clientMessageSchema>;

// Validation helper with typed result
export function validateClientMessage(data: unknown):
  | { success: true; data: ValidatedClientMessage }
  | { success: false; error: string } {
  const result = clientMessageSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errorPath = result.error.issues[0]?.path.join('.') || 'unknown';
  const errorMessage = result.error.issues[0]?.message || 'Invalid message';
  return { success: false, error: `${errorPath}: ${errorMessage}` };
}
