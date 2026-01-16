import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/client.js';
import { tasks, artifacts, agentSessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { SpawnWorkerParams, WorkerResult } from './types.js';
import { randomUUID } from 'crypto';
import { broadcastToProject } from '../websocket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Agent prompt file paths
const AGENT_PROMPT_PATHS: Record<string, string> = {
  pm: join(__dirname, '../agents/pm.md'),
  architect: join(__dirname, '../agents/architect.md'),
  developer: join(__dirname, '../agents/developer.md'),
  qa: join(__dirname, '../agents/qa.md'),
  reviewer: join(__dirname, '../agents/reviewer.md'),
};

// Load agent prompts lazily
function loadAgentPrompt(agentType: string): string {
  const promptPath = AGENT_PROMPT_PATHS[agentType];
  if (!promptPath || !existsSync(promptPath)) {
    return `You are a ${agentType} agent. Complete the assigned task and save any artifacts.`;
  }
  return readFileSync(promptPath, 'utf-8');
}

// Artifact info extracted from worker output
interface ArtifactInfo {
  type: string;
  title: string;
  content?: string;
  filePath?: string;
}

// Checkpoint worker session to database - only stores SDK session ID
async function checkpointWorkerSession(
  taskId: string,
  projectId: string,
  agentType: string,
  sdkSessionId: string | undefined,
  status: 'active' | 'completed' | 'failed' = 'active'
): Promise<void> {
  const sessionId = `${agentType}-${taskId}`;
  const sessionData = JSON.stringify({ sessionId: sdkSessionId });

  const existing = await db.select()
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(agentSessions)
      .set({ sessionData, status, updatedAt: new Date() })
      .where(eq(agentSessions.id, sessionId));
  } else {
    await db.insert(agentSessions).values({
      id: sessionId,
      projectId,
      agentType,
      sessionData,
      status,
    });
  }
}

/**
 * Spawns a worker agent in the background.
 * The agent runs to completion, saves its own artifacts, then terminates.
 * Completion is signaled via the onComplete callback.
 */
export function spawnWorkerAgent(params: SpawnWorkerParams): void {
  const { taskId, onComplete } = params;

  // Run in background - don't await
  runWorker(params)
    .then((result) => {
      onComplete(result);
    })
    .catch((error) => {
      onComplete({
        success: false,
        taskId,
        summary: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
}

async function runWorker(params: SpawnWorkerParams): Promise<WorkerResult> {
  const { taskId, projectId, agentType, input, cwd } = params;

  const systemPrompt = loadAgentPrompt(agentType);

  // Track artifacts created by this worker
  const savedArtifacts: ArtifactInfo[] = [];

  // Build the prompt - workers use standard tools and report artifacts in structured format
  const taskPrompt = `Task input:
${JSON.stringify(input, null, 2)}

Complete this task. Use the standard file tools (Read, Write, Edit, Bash) as needed.

When you create deliverables, output them in this format:
\`\`\`artifact
type: spec|design_doc|code_change|test_report|review|markdown
title: Short descriptive title
content: The full content here (optional if filePath provided)
filePath: Path to file if relevant (optional)
\`\`\`

When you're done, provide a brief summary of what you accomplished.`;

  // Track the SDK session ID for reading from SDK session files later
  let sdkSessionId: string | undefined;

  try {
    const queryOptions: Parameters<typeof query>[0] = {
      prompt: taskPrompt,
      options: {
        cwd,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt,
        // Use built-in claude_code tools
        tools: { type: 'preset', preset: 'claude_code' },
        // Enable streaming for real-time text updates
        includePartialMessages: true,
      },
    };

    const queryInstance = query(queryOptions);

    let summary = '';
    let messageCount = 0;
    let accumulatedStreamText = '';

    for await (const sdkMessage of queryInstance) {
      // Capture the SDK session ID
      if ('session_id' in sdkMessage && sdkMessage.session_id) {
        sdkSessionId = sdkMessage.session_id;
      }

      // Handle streaming text deltas
      if (sdkMessage.type === 'stream_event') {
        const event = (sdkMessage as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          accumulatedStreamText += event.delta.text;
          // Broadcast accumulated text with isPartial (not persisted)
          broadcastToProject(projectId, {
            type: 'agent_message',
            projectId,
            taskId,
            agentType,
            message: accumulatedStreamText,
            isPartial: true,
          });
        }
        continue;
      }

      // Handle complete assistant messages
      if (sdkMessage.type === 'assistant' && 'message' in sdkMessage) {
        const content = (sdkMessage.message as { content: unknown[] }).content as Array<{
          type: string;
          text?: string;
          name?: string;
          input?: unknown;
          id?: string;
        }>;

        // Extract text content and send to callback
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            summary = block.text;

            // Parse artifact blocks from text output FIRST (before sending to chat)
            const artifactMatches = [...block.text.matchAll(/```artifact\n([\s\S]*?)```/g)];

            for (const match of artifactMatches) {
              const artifactText = match[1];
              const artifact: ArtifactInfo = { type: 'markdown', title: 'Untitled' };

              // Parse header fields (type, title, filePath) and extract content
              const lines = artifactText.split('\n');
              let contentStartIdx = -1;

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const colonIdx = line.indexOf(':');
                if (colonIdx > 0) {
                  const key = line.slice(0, colonIdx).trim().toLowerCase();
                  const value = line.slice(colonIdx + 1).trim();
                  if (key === 'type') artifact.type = value;
                  else if (key === 'title') artifact.title = value;
                  else if (key === 'filepath' || key === 'filepath') artifact.filePath = value;
                  else if (key === 'content') {
                    // Content starts here - value may be on same line or continue on next lines
                    if (value) {
                      // If content is on same line, capture rest of artifact as content
                      contentStartIdx = i;
                      const contentLines = [value, ...lines.slice(i + 1)];
                      artifact.content = contentLines.join('\n').trim();
                    }
                    break;
                  }
                }
              }

              // If no content field found but there's text after headers, use that
              if (!artifact.content && contentStartIdx === -1) {
                // Find where headers end (first line without a colon key pattern)
                let headerEnd = 0;
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (line && !line.match(/^(type|title|filepath|content):/i)) {
                    headerEnd = i;
                    break;
                  }
                  headerEnd = i + 1;
                }
                if (headerEnd < lines.length) {
                  artifact.content = lines.slice(headerEnd).join('\n').trim();
                }
              }

              // Save artifact to database
              const artifactId = randomUUID();
              await db.insert(artifacts).values({
                id: artifactId,
                projectId,
                taskId,
                type: artifact.type,
                title: artifact.title,
                content: artifact.content,
                filePath: artifact.filePath,
              });

              // Broadcast artifact creation to clients
              broadcastToProject(projectId, {
                type: 'artifact_created',
                projectId,
                artifact: {
                  id: artifactId,
                  type: artifact.type,
                  title: artifact.title,
                },
              });

              savedArtifacts.push(artifact);
            }

            // Strip artifact blocks from text before sending to chat
            let displayText = block.text;
            for (const match of artifactMatches) {
              displayText = displayText.replace(match[0], '');
            }
            displayText = displayText.trim();

            // Reset accumulated stream text after complete message
            accumulatedStreamText = '';

            // Only send non-empty text to chat (skip if it was just an artifact block)
            if (displayText) {
              // Broadcast final complete message (persisted)
              broadcastToProject(projectId, {
                type: 'agent_message',
                projectId,
                taskId,
                agentType,
                message: displayText,
              });
            }
          }

          // Broadcast tool use to clients (so they appear in chat)
          if (block.type === 'tool_use' && block.name && block.input) {
            broadcastToProject(projectId, {
              type: 'agent_message',
              projectId,
              taskId,
              agentType,
              toolName: block.name,
              toolInput: block.input as Record<string, unknown>,
              toolUseId: block.id,
            });
          }
        }
      }

      // Handle tool results (user messages containing tool_result blocks)
      if (sdkMessage.type === 'user' && 'message' in sdkMessage) {
        const content = (sdkMessage.message as { content: unknown[] }).content as Array<{
          type: string;
          tool_use_id?: string;
          content?: string | Array<{ type: string; text?: string }>;
        }>;

        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            // Extract result content
            let resultText = '';
            if (typeof block.content === 'string') {
              resultText = block.content;
            } else if (Array.isArray(block.content)) {
              resultText = block.content
                .filter(c => c.type === 'text' && c.text)
                .map(c => c.text)
                .join('\n');
            }

            // Broadcast tool result to clients
            broadcastToProject(projectId, {
              type: 'agent_message',
              projectId,
              taskId,
              agentType,
              toolUseId: block.tool_use_id,
              toolResult: resultText,
            });
          }
        }
      }

      // Handle result message for final summary
      if (sdkMessage.type === 'result' && 'result' in sdkMessage) {
        summary = (sdkMessage as { result: string }).result || summary;
      }

      // Checkpoint periodically (every 5 turns)
      messageCount++;
      if (messageCount % 5 === 0) {
        await checkpointWorkerSession(taskId, projectId, agentType, sdkSessionId, 'active');
      }
    }

    // Final checkpoint with completed status
    await checkpointWorkerSession(taskId, projectId, agentType, sdkSessionId, 'completed');

    // Update task status to completed
    await db.update(tasks)
      .set({
        status: 'completed',
        output: JSON.stringify({
          summary,
          artifacts: savedArtifacts,
        }),
        completedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    // Build summary with artifact info
    const artifactSummary = savedArtifacts.length > 0
      ? `\n\nArtifacts created: ${savedArtifacts.map(a => `${a.type}: ${a.title}`).join(', ')}`
      : '';

    // Ensure summary is never empty (API rejects empty text content blocks)
    const finalSummary = (summary + artifactSummary).trim() || 'Task completed successfully.';

    return {
      success: true,
      taskId,
      summary: finalSummary,
    };
  } catch (error) {
    // Checkpoint with failed status
    await checkpointWorkerSession(taskId, projectId, agentType, sdkSessionId, 'failed');

    // Update task status to failed
    await db.update(tasks)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        attempts: 1,
      })
      .where(eq(tasks.id, taskId));

    throw error;
  }
}
