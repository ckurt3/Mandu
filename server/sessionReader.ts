/**
 * Session reader for Claude SDK session files.
 * Sessions are stored at ~/.claude/projects/{PROJECT_KEY}/{sessionId}.jsonl
 */
import { readFile, readdir, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

// SDK session entry types
interface SDKContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image' | 'document';
  text?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
}

interface SDKSessionEntry {
  type: 'user' | 'assistant' | 'system' | 'tool_result';
  message?: {
    role: string;
    content: SDKContentBlock[];
  };
  content?: SDKContentBlock[]; // Some entries have content directly
  timestamp?: string;
  session_id?: string;
  slug?: string;
  subtype?: string;
}

// Parsed message for display
export interface ParsedMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  timestamp: number;
}

// Session summary
export interface SessionInfo {
  sessionId: string;
  name: string | null;
  summary: string;
  timestamp: number | null;
  messageCount: number;
}

/**
 * Build the project key from a cwd path.
 * This matches how the SDK organizes sessions.
 */
export function getProjectKey(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

/**
 * Get the path to the sessions directory for a project.
 */
export function getSessionsDir(cwd: string): string {
  const projectKey = getProjectKey(cwd);
  return join(homedir(), '.claude', 'projects', projectKey);
}

/**
 * Check if a sessions directory exists.
 */
export async function sessionsExist(cwd: string): Promise<boolean> {
  try {
    await access(getSessionsDir(cwd));
    return true;
  } catch {
    return false;
  }
}

/**
 * List all session files in a project.
 */
export async function listSessions(cwd: string): Promise<SessionInfo[]> {
  const sessionsDir = getSessionsDir(cwd);

  try {
    await access(sessionsDir);
    const files = await readdir(sessionsDir);

    // Filter for session files (UUIDs ending in .jsonl, not agent-* files)
    const sessionFiles = files.filter(f =>
      f.endsWith('.jsonl') &&
      !f.startsWith('agent-') &&
      f.match(/^[0-9a-f-]+\.jsonl$/)
    );

    const sessions = await Promise.all(
      sessionFiles.map(async (file) => {
        const sessionId = file.replace('.jsonl', '');
        const filePath = join(sessionsDir, file);

        try {
          const content = await readFile(filePath, 'utf-8');
          const lines = content.trim().split('\n');

          let summary = 'Empty session';
          let slug: string | null = null;
          let timestamp: number | null = null;
          let messageCount = 0;

          for (const line of lines) {
            try {
              const entry: SDKSessionEntry = JSON.parse(line);

              // Capture slug from any entry that has it
              if (entry.slug && !slug) {
                slug = entry.slug;
              }

              if (entry.type === 'user' && entry.message?.content) {
                messageCount++;
                if (summary === 'Empty session') {
                  const textContent = entry.message.content.find(c => c.type === 'text');
                  if (textContent?.text) {
                    summary = textContent.text.slice(0, 100);
                    if (textContent.text.length > 100) summary += '...';
                  }
                }
                if (entry.timestamp) {
                  timestamp = new Date(entry.timestamp).getTime();
                }
              } else if (entry.type === 'assistant') {
                messageCount++;
                if (entry.timestamp) {
                  timestamp = new Date(entry.timestamp).getTime();
                }
              }
            } catch {
              // Skip malformed lines
            }
          }

          return {
            sessionId,
            name: slug,
            summary,
            timestamp,
            messageCount,
          };
        } catch {
          return null;
        }
      })
    );

    // Filter out nulls and sort by timestamp (newest first)
    return sessions
      .filter((s): s is SessionInfo => s !== null)
      .sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return b.timestamp - a.timestamp;
      });
  } catch {
    return [];
  }
}

/**
 * Helper to check if a message entry has displayable content.
 */
function hasDisplayableContent(entry: SDKSessionEntry): boolean {
  const content = entry.message?.content || entry.content;
  if (!content || !Array.isArray(content)) return false;

  if (entry.type === 'user') {
    // User messages need text content (not just tool results)
    return content.some(c => c.type === 'text');
  } else if (entry.type === 'assistant') {
    // Assistant messages need text or tool_use
    return content.some(c => c.type === 'text' || c.type === 'tool_use');
  }
  return false;
}

/**
 * Read all messages from a session file.
 */
export async function readSessionMessages(
  cwd: string,
  sessionId: string
): Promise<ParsedMessage[]> {
  const sessionsDir = getSessionsDir(cwd);
  const sessionPath = join(sessionsDir, `${sessionId}.jsonl`);

  try {
    const content = await readFile(sessionPath, 'utf-8');
    const lines = content.trim().split('\n');
    const messages: ParsedMessage[] = [];

    let lineTimestamp = Date.now();

    for (const line of lines) {
      try {
        const entry: SDKSessionEntry = JSON.parse(line);

        // Update timestamp from entry if available
        if (entry.timestamp) {
          lineTimestamp = new Date(entry.timestamp).getTime();
        }

        if (!hasDisplayableContent(entry)) continue;

        const content = entry.message?.content || entry.content || [];

        if (entry.type === 'user') {
          // Extract text content from user messages
          const textContent = content.find(c => c.type === 'text');
          if (textContent?.text) {
            messages.push({
              role: 'user',
              content: textContent.text,
              timestamp: lineTimestamp,
            });
          }
        } else if (entry.type === 'assistant') {
          // Extract text and tool use from assistant messages
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              messages.push({
                role: 'assistant',
                content: block.text,
                timestamp: lineTimestamp,
              });
            } else if (block.type === 'tool_use' && block.name) {
              messages.push({
                role: 'tool',
                content: '',
                toolName: block.name,
                toolInput: block.input as Record<string, unknown>,
                timestamp: lineTimestamp,
              });
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return messages;
  } catch {
    return [];
  }
}

/**
 * Read messages with pagination (returns most recent by default).
 */
export async function readSessionMessagesPaginated(
  cwd: string,
  sessionId: string,
  limit: number = 50,
  before?: number
): Promise<{
  messages: ParsedMessage[];
  total: number;
  startIndex: number;
  hasMore: boolean;
}> {
  const allMessages = await readSessionMessages(cwd, sessionId);
  const total = allMessages.length;

  let startIndex: number;
  let endIndex: number;

  if (before !== undefined && before > 0) {
    startIndex = Math.max(0, before - limit);
    endIndex = before;
  } else {
    startIndex = Math.max(0, total - limit);
    endIndex = total;
  }

  return {
    messages: allMessages.slice(startIndex, endIndex),
    total,
    startIndex,
    hasMore: startIndex > 0,
  };
}

/**
 * Filter out [System] messages that are internal EM events.
 */
export function filterSystemMessages(messages: ParsedMessage[]): ParsedMessage[] {
  return messages.filter(
    msg => !(msg.role === 'user' && msg.content.startsWith('[System]'))
  );
}
