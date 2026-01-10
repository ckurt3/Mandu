import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getCollections } from '../db/mongo.js';
import type { AgentType, ArtifactType, TaskStatus, GateStatus } from '../db/models.js';

// Zod schemas for validation
const AgentTypeSchema = z.enum(['em', 'pm', 'architect', 'developer', 'qa', 'reviewer']);
const ArtifactTypeSchema = z.enum(['spec', 'design_doc', 'code_change', 'test_report', 'markdown']);
const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);
const GateStatusSchema = z.enum(['pending', 'approved', 'changes_requested']);

// Helper to convert string to ObjectId safely
function toObjectId(id: string): ObjectId {
  return new ObjectId(id);
}

// Create the Mandu MCP server with all tools
export function createManduMcpServer(projectId: string) {
  return createSdkMcpServer({
    name: 'mandu',
    version: '1.0.0',
    tools: [
      // Task Management Tools
      tool(
        'create_task',
        'Create a new task and assign it to an agent. Returns the created task ID.',
        {
          title: z.string().describe('Short title for the task'),
          description: z.string().describe('Detailed description of what needs to be done'),
          assignedAgent: AgentTypeSchema.describe('Agent type to assign: em, pm, architect, developer, qa, or reviewer'),
          context: z.string().optional().describe('Additional context or instructions for the agent'),
        },
        async (args) => {
          console.log(`[MCP] create_task called with:`, JSON.stringify(args));
          const collections = getCollections();
          const now = new Date();

          const task = {
            projectId: toObjectId(projectId),
            title: args.title,
            description: args.description,
            status: 'pending' as TaskStatus,
            assignedAgent: args.assignedAgent as AgentType,
            context: args.context,
            createdAt: now,
            updatedAt: now,
          };

          const result = await collections.tasks.insertOne(task);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                taskId: result.insertedId.toString(),
                message: `Task "${args.title}" created and assigned to ${args.assignedAgent}`
              })
            }]
          };
        }
      ),

      tool(
        'update_task',
        'Update an existing task status or details.',
        {
          taskId: z.string().describe('The task ID to update'),
          status: TaskStatusSchema.optional().describe('New status: pending, in_progress, completed, or cancelled'),
          result: z.string().optional().describe('Result summary when completing the task'),
        },
        async (args) => {
          const collections = getCollections();

          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (args.status) updates.status = args.status;
          if (args.result) updates.result = args.result;

          await collections.tasks.updateOne(
            { _id: toObjectId(args.taskId) },
            { $set: updates }
          );

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ success: true, message: 'Task updated' })
            }]
          };
        }
      ),

      tool(
        'complete_task',
        'Mark a task as completed with a result summary.',
        {
          taskId: z.string().describe('The task ID to complete'),
          result: z.string().describe('Summary of what was accomplished'),
        },
        async (args) => {
          const collections = getCollections();

          await collections.tasks.updateOne(
            { _id: toObjectId(args.taskId) },
            {
              $set: {
                status: 'completed',
                result: args.result,
                updatedAt: new Date()
              }
            }
          );

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ success: true, message: 'Task completed' })
            }]
          };
        }
      ),

      tool(
        'get_task',
        'Get details of a specific task by ID.',
        {
          taskId: z.string().describe('The task ID to retrieve'),
        },
        async (args) => {
          const collections = getCollections();
          const task = await collections.tasks.findOne({ _id: toObjectId(args.taskId) });

          if (!task) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ success: false, error: 'Task not found' })
              }]
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                task: { ...task, _id: task._id?.toString(), projectId: task.projectId.toString() }
              })
            }]
          };
        }
      ),

      tool(
        'list_tasks',
        'List tasks for the current project, optionally filtered by status or assigned agent.',
        {
          status: TaskStatusSchema.optional().describe('Filter by status'),
          assignedAgent: AgentTypeSchema.optional().describe('Filter by assigned agent'),
        },
        async (args) => {
          const collections = getCollections();

          const filter: Record<string, unknown> = { projectId: toObjectId(projectId) };
          if (args.status) filter.status = args.status;
          if (args.assignedAgent) filter.assignedAgent = args.assignedAgent;

          const tasks = await collections.tasks.find(filter).toArray();

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                count: tasks.length,
                tasks: tasks.map(t => ({
                  ...t,
                  _id: t._id?.toString(),
                  projectId: t.projectId.toString()
                }))
              })
            }]
          };
        }
      ),

      // Artifact Management Tools
      tool(
        'create_artifact',
        'Create a new artifact (spec, design doc, code change, etc.) associated with a task.',
        {
          taskId: z.string().describe('The task ID this artifact belongs to'),
          name: z.string().describe('Name of the artifact'),
          type: ArtifactTypeSchema.describe('Type: spec, design_doc, code_change, test_report, or markdown'),
          content: z.string().describe('The artifact content (markdown, code diff, etc.)'),
          filePath: z.string().optional().describe('Optional file path if this maps to a file'),
        },
        async (args) => {
          const collections = getCollections();
          const now = new Date();

          // Get the task to find the assigned agent
          const task = await collections.tasks.findOne({ _id: toObjectId(args.taskId) });

          const artifact = {
            projectId: toObjectId(projectId),
            taskId: toObjectId(args.taskId),
            name: args.name,
            type: args.type as ArtifactType,
            content: args.content,
            filePath: args.filePath,
            createdBy: task?.assignedAgent || 'unknown',
            createdAt: now,
            updatedAt: now,
          };

          const result = await collections.artifacts.insertOne(artifact);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                artifactId: result.insertedId.toString(),
                message: `Artifact "${args.name}" created`
              })
            }]
          };
        }
      ),

      tool(
        'update_artifact',
        'Update an existing artifact content.',
        {
          artifactId: z.string().describe('The artifact ID to update'),
          content: z.string().describe('The new content'),
        },
        async (args) => {
          const collections = getCollections();

          await collections.artifacts.updateOne(
            { _id: toObjectId(args.artifactId) },
            { $set: { content: args.content, updatedAt: new Date() } }
          );

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ success: true, message: 'Artifact updated' })
            }]
          };
        }
      ),

      tool(
        'get_artifact',
        'Get a specific artifact by ID.',
        {
          artifactId: z.string().describe('The artifact ID to retrieve'),
        },
        async (args) => {
          const collections = getCollections();
          const artifact = await collections.artifacts.findOne({ _id: toObjectId(args.artifactId) });

          if (!artifact) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ success: false, error: 'Artifact not found' })
              }]
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                artifact: {
                  ...artifact,
                  _id: artifact._id?.toString(),
                  projectId: artifact.projectId.toString(),
                  taskId: artifact.taskId.toString()
                }
              })
            }]
          };
        }
      ),

      tool(
        'list_artifacts',
        'List artifacts for a specific task.',
        {
          taskId: z.string().describe('The task ID to list artifacts for'),
        },
        async (args) => {
          const collections = getCollections();
          const artifacts = await collections.artifacts.find({
            taskId: toObjectId(args.taskId)
          }).toArray();

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                count: artifacts.length,
                artifacts: artifacts.map(a => ({
                  ...a,
                  _id: a._id?.toString(),
                  projectId: a.projectId.toString(),
                  taskId: a.taskId.toString()
                }))
              })
            }]
          };
        }
      ),

      // Gate Management Tools
      tool(
        'create_gate',
        'Create an approval gate for human review. Use this when work needs approval before proceeding.',
        {
          taskId: z.string().describe('The task ID this gate is for'),
          title: z.string().describe('Short title for the gate'),
          description: z.string().describe('What needs to be reviewed/approved'),
          artifactIds: z.array(z.string()).describe('List of artifact IDs to review'),
        },
        async (args) => {
          const collections = getCollections();
          const now = new Date();

          // Get the task to find who requested the gate
          const task = await collections.tasks.findOne({ _id: toObjectId(args.taskId) });

          const gate = {
            projectId: toObjectId(projectId),
            taskId: toObjectId(args.taskId),
            title: args.title,
            description: args.description,
            status: 'pending' as GateStatus,
            artifactIds: args.artifactIds.map(id => toObjectId(id)),
            requestedBy: task?.assignedAgent || 'unknown',
            createdAt: now,
          };

          const result = await collections.gates.insertOne(gate);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                gateId: result.insertedId.toString(),
                message: `Gate "${args.title}" created and awaiting human approval`
              })
            }]
          };
        }
      ),

      tool(
        'get_gate',
        'Get details of a specific gate by ID.',
        {
          gateId: z.string().describe('The gate ID to retrieve'),
        },
        async (args) => {
          const collections = getCollections();
          const gate = await collections.gates.findOne({ _id: toObjectId(args.gateId) });

          if (!gate) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ success: false, error: 'Gate not found' })
              }]
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                gate: {
                  ...gate,
                  _id: gate._id?.toString(),
                  projectId: gate.projectId.toString(),
                  taskId: gate.taskId.toString(),
                  artifactIds: gate.artifactIds.map(id => id.toString())
                }
              })
            }]
          };
        }
      ),

      tool(
        'list_pending_gates',
        'List all pending gates for the current project that need human approval.',
        {},
        async () => {
          const collections = getCollections();
          const gates = await collections.gates.find({
            projectId: toObjectId(projectId),
            status: 'pending'
          }).toArray();

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                count: gates.length,
                gates: gates.map(g => ({
                  ...g,
                  _id: g._id?.toString(),
                  projectId: g.projectId.toString(),
                  taskId: g.taskId.toString(),
                  artifactIds: g.artifactIds.map(id => id.toString())
                }))
              })
            }]
          };
        }
      ),

      // Project Context Tool
      tool(
        'get_project_status',
        'Get an overview of the current project including task counts and pending gates.',
        {},
        async () => {
          const collections = getCollections();
          const pid = toObjectId(projectId);

          const [project, taskCounts, pendingGates] = await Promise.all([
            collections.projects.findOne({ _id: pid }),
            collections.tasks.aggregate([
              { $match: { projectId: pid } },
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]).toArray(),
            collections.gates.countDocuments({ projectId: pid, status: 'pending' })
          ]);

          const statusMap = Object.fromEntries(
            taskCounts.map(t => [t._id, t.count])
          );

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                project: project ? {
                  ...project,
                  _id: project._id?.toString()
                } : null,
                tasks: {
                  pending: statusMap.pending || 0,
                  in_progress: statusMap.in_progress || 0,
                  completed: statusMap.completed || 0,
                  cancelled: statusMap.cancelled || 0,
                },
                pendingGates
              })
            }]
          };
        }
      ),
    ]
  });
}
