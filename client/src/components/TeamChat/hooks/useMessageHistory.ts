import { useState, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../types';

interface UseMessageHistoryOptions {
  projectId: string;
  currentMessageCount: number;
  onLoadEarlierMessages?: (messages: ChatMessage[]) => void;
}

interface UseMessageHistoryReturn {
  hiddenMessageCount: number;
  isLoadingMore: boolean;
  loadEarlierMessages: () => Promise<void>;
}

export function useMessageHistory({
  projectId,
  currentMessageCount,
  onLoadEarlierMessages,
}: UseMessageHistoryOptions): UseMessageHistoryReturn {
  const [hiddenMessageCount, setHiddenMessageCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasCheckedHistory, setHasCheckedHistory] = useState(false);

  // Check for earlier messages when project changes
  useEffect(() => {
    if (!projectId || hasCheckedHistory) return;

    const checkHistory = async () => {
      try {
        const res = await fetch(`/api/project/${projectId}/history?limit=1`);
        if (res.ok) {
          const { total } = await res.json();
          if (total > currentMessageCount) {
            setHiddenMessageCount(total - currentMessageCount);
          }
          setHasCheckedHistory(true);
        }
      } catch (err) {
        console.error('Failed to check history:', err);
      }
    };

    // Small delay to let current messages load first
    const timer = setTimeout(checkHistory, 500);
    return () => clearTimeout(timer);
  }, [projectId, hasCheckedHistory, currentMessageCount]);

  // Reset history check when project changes
  useEffect(() => {
    setHasCheckedHistory(false);
    setHiddenMessageCount(0);
  }, [projectId]);

  // Load earlier messages from the API
  const loadEarlierMessages = useCallback(async () => {
    if (isLoadingMore || !projectId) return;

    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/project/${projectId}/history?limit=50&before=${hiddenMessageCount + currentMessageCount}`);

      if (res.ok) {
        const { messages, hasMore, startIndex } = await res.json();

        if (messages.length > 0 && onLoadEarlierMessages) {
          // Convert API messages to ChatMessage format
          const earlierMessages: ChatMessage[] = messages.map((m: {
            role: 'user' | 'assistant' | 'tool';
            content: string;
            toolName?: string;
            toolInput?: Record<string, unknown>;
            isToolResult?: boolean;
            timestamp: number;
            agentId?: string;
          }, i: number) => ({
            id: `history-${m.timestamp}-${i}`,
            agentType: m.role === 'user' ? 'user' : (m.agentId?.split('-')[0] || 'em'),
            role: m.role,
            content: m.content,
            toolName: m.toolName,
            toolInput: m.toolInput,
            isToolResult: m.isToolResult,
            timestamp: m.timestamp,
          }));

          onLoadEarlierMessages(earlierMessages);
        }

        setHiddenMessageCount(hasMore ? startIndex : 0);
      }
    } catch (err) {
      console.error('Failed to load earlier messages:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, projectId, hiddenMessageCount, currentMessageCount, onLoadEarlierMessages]);

  return {
    hiddenMessageCount,
    isLoadingMore,
    loadEarlierMessages,
  };
}
