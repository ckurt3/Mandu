import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface SessionMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isToolResult?: boolean;
  timestamp: number;
}

interface SessionEntry {
  type: string;
  timestamp: string;
  sessionId: string;
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
      tool_use_id?: string;
      content?: string | unknown[];
    }>;
  };
}

export function getSessionHistoryPath(sessionId: string, cwd: string): string | null {
  // Claude SDK stores sessions at ~/.claude/projects/{escaped-path}/{sessionId}.jsonl
  const escapedPath = cwd.replace(/\//g, '-');
  const sessionPath = join(homedir(), '.claude', 'projects', escapedPath, `${sessionId}.jsonl`);

  if (existsSync(sessionPath)) {
    return sessionPath;
  }

  return null;
}

export function readSessionHistory(sessionId: string, cwd: string): SessionMessage[] {
  const sessionPath = getSessionHistoryPath(sessionId, cwd);

  if (!sessionPath) {
    console.log(`Session file not found for ${sessionId} in ${cwd}`);
    return [];
  }

  try {
    const content = readFileSync(sessionPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    const messages: SessionMessage[] = [];

    for (const line of lines) {
      try {
        const entry: SessionEntry = JSON.parse(line);

        // Skip non-message entries (like queue-operation)
        if (entry.type !== 'user' && entry.type !== 'assistant') {
          continue;
        }

        if (!entry.message?.content) {
          continue;
        }

        const timestamp = new Date(entry.timestamp).getTime();

        if (entry.type === 'user') {
          // Extract text from user message
          const textBlocks = entry.message.content.filter(b => b.type === 'text');
          const text = textBlocks.map(b => b.text || '').join('');

          if (text) {
            messages.push({
              role: 'user',
              content: text,
              timestamp,
            });
          }

          // Extract tool results
          const toolResults = entry.message.content.filter(b => b.type === 'tool_result');
          for (const result of toolResults) {
            const output = typeof result.content === 'string'
              ? result.content
              : JSON.stringify(result.content);
            const truncated = output.length > 500 ? output.slice(0, 500) + '...' : output;

            messages.push({
              role: 'tool',
              content: truncated,
              isToolResult: true,
              timestamp,
            });
          }
        } else if (entry.type === 'assistant') {
          // Extract text from assistant message
          const textBlocks = entry.message.content.filter(b => b.type === 'text');
          const text = textBlocks.map(b => b.text || '').join('');

          if (text) {
            messages.push({
              role: 'assistant',
              content: text,
              timestamp,
            });
          }

          // Extract tool uses
          const toolUses = entry.message.content.filter(b => b.type === 'tool_use');
          for (const tool of toolUses) {
            messages.push({
              role: 'tool',
              content: '',
              toolName: tool.name,
              toolInput: tool.input,
              timestamp,
            });
          }
        }
      } catch (parseError) {
        // Skip malformed lines
        continue;
      }
    }

    return messages;
  } catch (error) {
    console.error(`Failed to read session history: ${error}`);
    return [];
  }
}
