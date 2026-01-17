import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '../db/client.js';
import { artifacts } from '../db/schema.js';
import { broadcastToProject } from '../websocket.js';

/**
 * Creates an MCP server with worker tools (currently just create_artifact).
 * This allows worker agents to save artifacts via structured tool calls
 * instead of embedding them in text output.
 */
export function createWorkerMcpServer(projectId: string, taskId: string) {
  return createSdkMcpServer({
    name: 'worker-tools',
    tools: [
      tool(
        'create_artifact',
        'Save a document or artifact for human review. Use this to save specs, designs, code change summaries, test reports, or reviews.',
        {
          type: z.enum(['spec', 'design_doc', 'code_change', 'test_report', 'review', 'markdown'])
            .describe('The type of artifact'),
          title: z.string()
            .describe('A short, descriptive title for the artifact'),
          content: z.string()
            .describe('The full content of the artifact (markdown supported)'),
          filePath: z.string().optional()
            .describe('Optional file path if this artifact relates to a specific file'),
        },
        async (args) => {
          console.log(`[Worker MCP] create_artifact called: ${args.type} - ${args.title}`);
          const artifactId = randomUUID();

          // Save to database
          await db.insert(artifacts).values({
            id: artifactId,
            projectId,
            taskId,
            type: args.type,
            title: args.title,
            content: args.content,
            filePath: args.filePath,
          });

          // Broadcast to clients
          broadcastToProject(projectId, {
            type: 'artifact_created',
            projectId,
            artifact: {
              id: artifactId,
              type: args.type,
              title: args.title,
            },
          });

          return {
            content: [{ type: 'text', text: `Artifact saved: ${args.title} (${args.type})` }]
          };
        }
      ),
    ],
  });
}
