import { useState, useRef, useEffect, FormEvent, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentState, Gate, Artifact } from '../types';
import { GateCard } from './GateCard';
import { ArtifactsTab } from './ArtifactsTab';
import { ArtifactsPanel } from './ArtifactsPanel';
import { ArtifactModal } from './ArtifactModal';

// All possible agent types in order
const ALL_AGENT_TYPES = ['em', 'pm', 'architect', 'developer', 'qa', 'reviewer', 'release-manager'] as const;

const AGENT_CONFIG: Record<string, {
  emoji: string;
  label: string;
  shortLabel: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  description: string;
}> = {
  em: {
    emoji: '👔',
    label: 'Engineering Manager',
    shortLabel: 'EM',
    textColor: 'text-orange',
    bgColor: 'bg-orange/10',
    borderColor: 'border-orange/30',
    description: 'Orchestrates the team, breaks down tasks, and coordinates between agents. The EM receives your requests and delegates work to specialized agents.',
  },
  pm: {
    emoji: '📋',
    label: 'Product Manager',
    shortLabel: 'PM',
    textColor: 'text-[#A78BFA]',
    bgColor: 'bg-[#8B5CF6]/10',
    borderColor: 'border-[#8B5CF6]/30',
    description: 'Writes specifications, defines requirements, and ensures the product vision is clear. Creates detailed specs before implementation begins.',
  },
  architect: {
    emoji: '🏗️',
    label: 'Architect',
    shortLabel: 'ARCH',
    textColor: 'text-[#60A5FA]',
    bgColor: 'bg-[#3B82F6]/10',
    borderColor: 'border-[#3B82F6]/30',
    description: 'Designs system architecture, makes technical decisions, and creates implementation plans. Ensures code quality and maintainability.',
  },
  developer: {
    emoji: '💻',
    label: 'Developer',
    shortLabel: 'DEV',
    textColor: 'text-[#34D399]',
    bgColor: 'bg-[#10B981]/10',
    borderColor: 'border-[#10B981]/30',
    description: 'Writes code, implements features, and fixes bugs. The hands-on engineer who turns plans into working software.',
  },
  qa: {
    emoji: '🧪',
    label: 'QA Engineer',
    shortLabel: 'QA',
    textColor: 'text-[#FBBF24]',
    bgColor: 'bg-[#F59E0B]/10',
    borderColor: 'border-[#F59E0B]/30',
    description: 'Tests implementations, writes test cases, and ensures quality. Catches bugs and verifies features work correctly.',
  },
  reviewer: {
    emoji: '🔍',
    label: 'Code Reviewer',
    shortLabel: 'REV',
    textColor: 'text-[#F472B6]',
    bgColor: 'bg-[#EC4899]/10',
    borderColor: 'border-[#EC4899]/30',
    description: 'Reviews code changes, suggests improvements, and ensures best practices. Provides feedback before code is merged.',
  },
  'release-manager': {
    emoji: '🚀',
    label: 'Release Manager',
    shortLabel: 'RM',
    textColor: 'text-[#14B8A6]',
    bgColor: 'bg-[#0D9488]/10',
    borderColor: 'border-[#0D9488]/30',
    description: 'Creates pull requests, manages releases, and pushes code to GitHub. Handles the final step of getting code merged.',
  },
  user: {
    emoji: '👤',
    label: 'You',
    shortLabel: 'YOU',
    textColor: 'text-text-primary',
    bgColor: 'bg-bg-hover',
    borderColor: 'border-border',
    description: 'That\'s you!',
  },
};

interface AgentWithType {
  agent: AgentState;
  type: string;
}

interface TeamChatProps {
  agents: AgentWithType[];
  onSendMessage: (message: string) => void;
  projectName: string;
  gates: Gate[];
  artifacts: Artifact[];
  onResolveGate: (gateId: string, status: 'approved' | 'changes_requested', comment?: string) => void;
}

interface ChatMessage {
  id: string;
  agentType: string;
  role: 'assistant' | 'user' | 'tool';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  isPartial?: boolean;
  timestamp: number;
}

export function TeamChat({ agents, onSendMessage, projectName, gates, artifacts, onResolveGate }: TeamChatProps) {
  const [input, setInput] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [selectedAgentType, setSelectedAgentType] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Create a map of active agents by type
  const agentsByType = useMemo(() => {
    const map = new Map<string, AgentWithType>();
    for (const a of agents) {
      map.set(a.type, a);
    }
    return map;
  }, [agents]);

  // Merge all agent messages into a single timeline sorted by actual timestamp
  const chatMessages = useMemo(() => {
    const allMessages: ChatMessage[] = [];

    for (const { agent, type } of agents) {
      for (const msg of agent.messages) {
        allMessages.push({
          id: `${agent.id}-${msg.id}`,
          agentType: msg.role === 'user' ? 'user' : type,
          role: msg.role,
          content: msg.content,
          toolName: msg.toolName,
          toolInput: msg.toolInput,
          toolResult: msg.toolResult,
          isPartial: msg.isPartial,
          timestamp: msg.timestamp || 0, // Use actual message timestamp
        });
      }
    }

    // Sort by timestamp to get proper chronological order across all agents
    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }, [agents]);

  const isAnyWorking = agents.some(a => a.agent.status === 'thinking');

  // Check if EM is initializing (thinking but no messages yet)
  const emAgent = agentsByType.get('em');
  const isEMInitializing = emAgent?.agent.status === 'thinking' && emAgent.agent.messages.length === 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAnyWorking) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const toggleToolExpand = (id: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getToolDisplay = (name: string, toolInput?: Record<string, unknown>) => {
    // Strip various MCP prefixes: mcp__mandu__, mandu__, mcp__mongodb__, etc.
    const baseName = name
      .replace(/^mcp__mandu__/, '')
      .replace(/^mandu__/, '')
      .replace(/^mcp__mongodb__/, '')
      .replace(/^mcp__/, '');

    const toolMap: Record<string, {
      icon: string;
      label: string;
      textColor: string;
      bgColor: string;
      getDesc?: (i: Record<string, unknown>) => string
    }> = {
      // Mandu orchestration tools
      'create_task': {
        icon: '◆',
        label: 'DISPATCH',
        textColor: 'text-orange',
        bgColor: 'bg-orange/5',
        getDesc: (i) => i.assignedAgent ? `→ ${String(i.assignedAgent).toUpperCase()}` : ''
      },
      'complete_task': { icon: '✓', label: 'COMPLETE', textColor: 'text-green', bgColor: 'bg-green/5' },
      'update_task': { icon: '↻', label: 'UPDATE', textColor: 'text-orange', bgColor: 'bg-orange/5' },
      'get_task': { icon: '◇', label: 'GET TASK', textColor: 'text-text-secondary', bgColor: 'bg-bg-hover' },
      'list_tasks': { icon: '≡', label: 'TASKS', textColor: 'text-text-secondary', bgColor: 'bg-bg-hover' },
      'create_artifact': {
        icon: '❖',
        label: 'ARTIFACT',
        textColor: 'text-[#A78BFA]',
        bgColor: 'bg-[#8B5CF6]/5',
        getDesc: (i) => i.name ? String(i.name).slice(0, 25) : ''
      },
      'update_artifact': { icon: '❖', label: 'UPDATE ART', textColor: 'text-[#A78BFA]', bgColor: 'bg-[#8B5CF6]/5' },
      'get_artifact': { icon: '❖', label: 'GET ART', textColor: 'text-[#A78BFA]', bgColor: 'bg-[#8B5CF6]/5' },
      'list_artifacts': { icon: '❖', label: 'ARTIFACTS', textColor: 'text-[#A78BFA]', bgColor: 'bg-[#8B5CF6]/5' },
      'create_gate': {
        icon: '⊡',
        label: 'GATE',
        textColor: 'text-golden',
        bgColor: 'bg-golden/5',
        getDesc: (i) => i.title ? String(i.title).slice(0, 25) : ''
      },
      'get_gate': { icon: '⊡', label: 'GET GATE', textColor: 'text-golden', bgColor: 'bg-golden/5' },
      'list_pending_gates': { icon: '⊡', label: 'GATES', textColor: 'text-golden', bgColor: 'bg-golden/5' },
      'get_project_status': { icon: '📊', label: 'STATUS', textColor: 'text-text-secondary', bgColor: 'bg-bg-hover' },

      // File tools
      'Read': {
        icon: '▸',
        label: 'READ',
        textColor: 'text-[#60A5FA]',
        bgColor: 'bg-[#3B82F6]/5',
        getDesc: (i) => i.file_path ? String(i.file_path).split('/').pop() || '' : ''
      },
      'Write': {
        icon: '◂',
        label: 'WRITE',
        textColor: 'text-[#60A5FA]',
        bgColor: 'bg-[#3B82F6]/5',
        getDesc: (i) => i.file_path ? String(i.file_path).split('/').pop() || '' : ''
      },
      'Edit': {
        icon: '⟡',
        label: 'EDIT',
        textColor: 'text-[#60A5FA]',
        bgColor: 'bg-[#3B82F6]/5',
        getDesc: (i) => i.file_path ? String(i.file_path).split('/').pop() || '' : ''
      },
      'Bash': {
        icon: '⌘',
        label: 'EXEC',
        textColor: 'text-[#A78BFA]',
        bgColor: 'bg-[#8B5CF6]/5',
        getDesc: (i) => {
          if (i.command) {
            const cmd = String(i.command).trim();
            return cmd.length > 30 ? cmd.slice(0, 30) + '...' : cmd;
          }
          return '';
        }
      },
      'Task': {
        icon: '◆',
        label: 'AGENT',
        textColor: 'text-orange',
        bgColor: 'bg-orange/5',
      },
      'Glob': {
        icon: '⌕',
        label: 'GLOB',
        textColor: 'text-[#34D399]',
        bgColor: 'bg-[#10B981]/5',
        getDesc: (i) => i.pattern ? String(i.pattern).slice(0, 25) : ''
      },
      'Grep': {
        icon: '⌕',
        label: 'GREP',
        textColor: 'text-[#34D399]',
        bgColor: 'bg-[#10B981]/5',
        getDesc: (i) => i.pattern ? String(i.pattern).slice(0, 25) : ''
      },

      // MongoDB tools - sponsor callout!
      'find': { icon: '🍃', label: 'MONGODB', textColor: 'text-[#00ED64]', bgColor: 'bg-[#00ED64]/5', getDesc: (i) => i.collection ? `find → ${String(i.collection)}` : 'find' },
      'aggregate': { icon: '🍃', label: 'MONGODB', textColor: 'text-[#00ED64]', bgColor: 'bg-[#00ED64]/5', getDesc: (i) => i.collection ? `aggregate → ${String(i.collection)}` : 'aggregate' },
      'insert-many': { icon: '🍃', label: 'MONGODB', textColor: 'text-[#00ED64]', bgColor: 'bg-[#00ED64]/5', getDesc: (i) => i.collection ? `insert → ${String(i.collection)}` : 'insert' },
      'update-many': { icon: '🍃', label: 'MONGODB', textColor: 'text-[#00ED64]', bgColor: 'bg-[#00ED64]/5', getDesc: (i) => i.collection ? `update → ${String(i.collection)}` : 'update' },
      'delete-many': { icon: '🍃', label: 'MONGODB', textColor: 'text-red', bgColor: 'bg-red/5', getDesc: (i) => i.collection ? `delete → ${String(i.collection)}` : 'delete' },
      'count': { icon: '🍃', label: 'MONGODB', textColor: 'text-[#00ED64]', bgColor: 'bg-[#00ED64]/5', getDesc: (i) => i.collection ? `count → ${String(i.collection)}` : 'count' },
      'collection-schema': { icon: '🍃', label: 'MONGODB', textColor: 'text-[#00ED64]', bgColor: 'bg-[#00ED64]/5', getDesc: (i) => i.collection ? `schema → ${String(i.collection)}` : 'schema' },
      'collection-indexes': { icon: '🍃', label: 'MONGODB', textColor: 'text-[#00ED64]', bgColor: 'bg-[#00ED64]/5', getDesc: (i) => i.collection ? `indexes → ${String(i.collection)}` : 'indexes' },

      // Linear tools
      'get_issue': { icon: '◇', label: 'LINEAR', textColor: 'text-[#5E6AD2]', bgColor: 'bg-[#5E6AD2]/5', getDesc: (i) => i.id ? String(i.id) : '' },
      'list_issues': { icon: '◇', label: 'LINEAR', textColor: 'text-[#5E6AD2]', bgColor: 'bg-[#5E6AD2]/5', getDesc: () => 'list issues' },
      'create_issue': { icon: '◇', label: 'LINEAR', textColor: 'text-[#5E6AD2]', bgColor: 'bg-[#5E6AD2]/5', getDesc: (i) => i.title ? `create → ${String(i.title).slice(0, 20)}` : 'create' },
      'update_issue': { icon: '◇', label: 'LINEAR', textColor: 'text-[#5E6AD2]', bgColor: 'bg-[#5E6AD2]/5', getDesc: (i) => i.id ? `update → ${String(i.id)}` : 'update' },

      // GitHub tools
      'get_file_contents': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#f0f6fc]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.path ? String(i.path).split('/').pop() : '' },
      'create_pull_request': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#238636]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.title ? `PR → ${String(i.title).slice(0, 20)}` : 'create PR' },
      'list_pull_requests': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#f0f6fc]', bgColor: 'bg-[#238636]/10', getDesc: () => 'list PRs' },
      'create_or_update_file': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#238636]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.path ? String(i.path).split('/').pop() : '' },
      'push_files': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#238636]', bgColor: 'bg-[#238636]/10', getDesc: () => 'push files' },
      'create_branch': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#238636]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.branch ? String(i.branch) : '' },
      'search_code': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#f0f6fc]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.query ? String(i.query).slice(0, 20) : 'search' },
    };

    const tool = toolMap[baseName] || toolMap[name];
    if (tool) {
      const desc = tool.getDesc && toolInput ? tool.getDesc(toolInput) : '';
      return { ...tool, desc, baseName };
    }

    // Fallback - show truncated but readable name
    return {
      icon: '○',
      label: baseName.replace(/_/g, ' ').toUpperCase().slice(0, 12),
      desc: '',
      textColor: 'text-text-muted',
      bgColor: 'bg-bg-hover',
      baseName,
    };
  };

  // Group consecutive messages from same agent
  const groupedMessages = useMemo(() => {
    const groups: Array<{ agentType: string; messages: ChatMessage[] }> = [];
    for (const msg of chatMessages) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.agentType === msg.agentType) {
        lastGroup.messages.push(msg);
      } else {
        groups.push({
          agentType: msg.agentType,
          messages: [msg],
        });
      }
    }
    return groups;
  }, [chatMessages]);

  const selectedAgent = selectedAgentType ? agentsByType.get(selectedAgentType) : null;
  const selectedConfig = selectedAgentType ? AGENT_CONFIG[selectedAgentType] : null;

  // Get the first pending gate (for the input area UI)
  const pendingGate = gates.find(g => g.status === 'pending');
  const [gateComment, setGateComment] = useState('');
  const [viewingArtifact, setViewingArtifact] = useState<Artifact | null>(null);

  // Artifacts panel state
  const [artifactsPanelOpen, setArtifactsPanelOpen] = useState(false);

  // Get artifacts for the pending gate
  const pendingGateArtifacts = pendingGate
    ? artifacts.filter(a => pendingGate.artifactIds?.includes(a._id))
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Agent Status Bar - Fixed */}
      <div className="flex-shrink-0 flex items-center gap-3 pl-20 pr-5 py-3 border-b border-border bg-bg-secondary/80 backdrop-blur-sm">
        {/* Brand - visible on desktop, sits next to hamburger */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <span className="text-2xl">🥟</span>
          <span className="text-lg font-extrabold text-orange tracking-tight">Mandu</span>
        </div>

        {/* Artifacts Tab - only show when artifacts exist */}
        {artifacts.length > 0 && (
          <ArtifactsTab
            count={artifacts.length}
            isOpen={artifactsPanelOpen}
            onClick={() => setArtifactsPanelOpen(!artifactsPanelOpen)}
          />
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Agent chips - right aligned */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {ALL_AGENT_TYPES.map((type) => {
          const config = AGENT_CONFIG[type];
          const agentData = agentsByType.get(type);
          const isActive = !!agentData;
          const isWorking = agentData?.agent.status === 'thinking';

          return (
            <button
              key={type}
              onClick={() => setSelectedAgentType(type)}
              className={`
                flex items-center gap-2 px-2.5 py-1.5 rounded-lg border flex-shrink-0
                transition-all duration-200 hover:scale-105
                ${isActive ? config.bgColor : 'bg-bg-elevated/50'}
                ${isWorking ? 'border-orange' : isActive ? config.borderColor : 'border-border/50'}
                ${!isActive ? 'opacity-50' : ''}
              `}
            >
              <span className={`text-base ${!isActive ? 'grayscale' : ''}`}>{config.emoji}</span>
              <span className={`text-[11px] font-bold ${isActive ? config.textColor : 'text-text-muted'}`}>
                {config.shortLabel}
              </span>
              <span className={`
                w-2 h-2 rounded-full flex-shrink-0
                ${!isActive ? 'bg-text-muted/30' :
                  isWorking ? 'bg-orange animate-pulse' :
                  agentData?.agent.status === 'idle' ? 'bg-green' :
                  agentData?.agent.status === 'error' ? 'bg-red' : 'bg-text-muted'}
              `} />
            </button>
          );
        })}
        </div>
      </div>

      {/* Artifacts Panel (conditional) */}
      <ArtifactsPanel
        artifacts={artifacts}
        isOpen={artifactsPanelOpen}
        onClose={() => setArtifactsPanelOpen(false)}
        onSelectArtifact={(artifact) => {
          setViewingArtifact(artifact);
        }}
      />

      {/* Chat Messages - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        <div className={`max-w-3xl mx-auto px-5 py-4 w-full ${groupedMessages.length === 0 && !pendingGate ? 'flex-1 flex flex-col justify-center' : ''}`}>
          {groupedMessages.length === 0 && !pendingGate ? (
            <div className="flex flex-col items-center justify-center text-center">
              <div className={`w-20 h-20 rounded-2xl bg-orange/10 border border-orange/20 flex items-center justify-center text-4xl mb-5 ${isEMInitializing ? 'animate-pulse' : ''}`}>
                🥟
              </div>
              {isEMInitializing ? (
                <>
                  <h3 className="text-lg font-bold text-text-primary mb-2">Initializing your AI team...</h3>
                  <p className="text-text-muted max-w-sm">
                    The Engineering Manager is setting up <span className="text-orange font-semibold">{projectName}</span>
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-sm text-text-muted">
                    <span className="w-2 h-2 rounded-full bg-orange animate-pulse" />
                    <span>Analyzing project requirements</span>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-text-primary mb-2">Ready to collaborate</h3>
                  <p className="text-text-muted max-w-sm">
                    Send a message to start working with your AI team on <span className="text-orange font-semibold">{projectName}</span>
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
            {groupedMessages.map((group, idx) => {
              const config = AGENT_CONFIG[group.agentType] || AGENT_CONFIG.em;
              const isUser = group.messages[0].role === 'user';

              return (
                <div key={idx} className={`flex gap-3 w-full ${isUser ? 'flex-row-reverse' : ''}`}>
                  {/* Avatar */}
                  <button
                    onClick={() => setSelectedAgentType(group.agentType)}
                    className={`
                      w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0
                      ${config.bgColor} ${config.borderColor} border
                      hover:scale-110 transition-transform
                    `}
                  >
                    {config.emoji}
                  </button>

                  {/* Messages */}
                  <div className={`flex flex-col gap-1.5 max-w-[75%] min-w-0 ${isUser ? 'items-end' : ''}`}>
                    {/* Agent Name */}
                    <span className={`text-xs font-bold ${config.textColor} px-1`}>
                      {config.label}
                    </span>

                    {group.messages.map((msg) => {
                      // Tool call - expandable
                      if (msg.role === 'tool' && msg.toolName) {
                        const tool = getToolDisplay(msg.toolName, msg.toolInput);
                        const isExpanded = expandedTools.has(msg.id);

                        // Check if this tool is still running
                        // Tool calls and results come in order: tool_use → tool_result → tool_use → tool_result...
                        // A tool is running if there are no messages after it in the agent's message list
                        const agentData = agentsByType.get(group.agentType);
                        const agentMessages = agentData?.agent.messages || [];
                        const thisIndex = agentMessages.findIndex(m => `${agentData?.agent.id}-${m.id}` === msg.id);
                        const hasMessagesAfter = thisIndex >= 0 && thisIndex < agentMessages.length - 1;
                        const isToolRunning = !hasMessagesAfter && !msg.isToolResult;

                        return (
                          <div key={msg.id} className="flex flex-col">
                            <button
                              onClick={() => toggleToolExpand(msg.id)}
                              className={`
                                inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                                ${tool.bgColor} border border-border
                                text-xs font-mono ${tool.textColor}
                                hover:border-border-light transition-all
                                ${isExpanded ? 'rounded-b-none border-b-0' : ''}
                                ${isToolRunning ? `ring-1 ${config.borderColor.replace('border-', 'ring-')}` : ''}
                              `}
                            >
                              {isToolRunning ? (
                                <span className={`w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin ${config.textColor}`} />
                              ) : (
                                <span className="opacity-70">{tool.icon}</span>
                              )}
                              <span className="font-bold">{tool.label}</span>
                              {tool.desc && (
                                <>
                                  <span className="opacity-30">→</span>
                                  <span className="opacity-60 truncate max-w-[180px]">{tool.desc}</span>
                                </>
                              )}
                              {isToolRunning && (
                                <span className={`${config.textColor} text-[10px] font-semibold uppercase tracking-wide ml-1`}>running</span>
                              )}
                              <span className={`ml-1 opacity-40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                ▾
                              </span>
                            </button>

                            {/* Expanded Details */}
                            {isExpanded && (
                              <div className={`
                                ${tool.bgColor} border border-border border-t-0 rounded-b-lg
                                p-3 text-xs font-mono space-y-2
                              `}>
                                {msg.toolInput && Object.keys(msg.toolInput).length > 0 && (
                                  <div>
                                    <div className="text-text-muted mb-1 font-sans font-semibold text-[10px] uppercase tracking-wide">Input</div>
                                    <pre className="bg-bg-primary/50 rounded p-2 overflow-x-auto text-text-secondary max-h-[200px] overflow-y-auto">
                                      {JSON.stringify(msg.toolInput, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {msg.toolResult && (
                                  <div>
                                    <div className="text-text-muted mb-1 font-sans font-semibold text-[10px] uppercase tracking-wide">Result</div>
                                    <pre className="bg-bg-primary/50 rounded p-2 overflow-x-auto text-text-secondary max-h-[200px] overflow-y-auto">
                                      {msg.toolResult.length > 500 ? msg.toolResult.slice(0, 500) + '...' : msg.toolResult}
                                    </pre>
                                  </div>
                                )}
                                {!msg.toolInput && !msg.toolResult && (
                                  <p className="text-text-muted italic font-sans">No additional details</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Skip tool results shown inline
                      if (msg.role === 'tool') return null;

                      // Message bubble
                      return (
                        <div
                          key={msg.id}
                          className={`
                            rounded-2xl px-4 py-2.5
                            ${isUser
                              ? 'bg-orange/15 border border-orange/25 rounded-tr-md'
                              : 'bg-bg-elevated border border-border rounded-tl-md'
                            }
                            ${msg.isPartial ? 'opacity-60' : ''}
                          `}
                        >
                          <div className="chat-markdown text-sm text-text-primary leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Pending Gate Card - In Chat */}
            {pendingGate && (
              <div className="flex gap-3 animate-slide-up">
                <div className="w-9 h-9 rounded-xl bg-orange/15 border border-orange/30 flex items-center justify-center text-lg flex-shrink-0">
                  🥟
                </div>
                <div className="flex flex-col gap-1.5 flex-1 max-w-[85%]">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-bold text-orange">Mandu</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-orange/20 text-[9px] font-bold text-orange">
                      needs review
                    </span>
                  </div>
                  <div className="bg-bg-elevated border border-orange/30 rounded-2xl rounded-tl-md p-4">
                    <h4 className="text-sm font-bold text-text-primary mb-2">{pendingGate.title}</h4>
                    {pendingGate.description && (
                      <div className="text-sm text-text-secondary leading-relaxed markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {pendingGate.description}
                        </ReactMarkdown>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-border/50 text-xs text-text-muted">
                      Requested by <span className="text-orange font-semibold">{pendingGate.requestedBy}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Typing Indicators */}
            {agents
              .filter(({ agent }) => agent.status === 'thinking')
              .map(({ agent, type }) => {
                const config = AGENT_CONFIG[type] || AGENT_CONFIG.em;
                return (
                  <div key={`typing-${agent.id}`} className="flex gap-3 animate-fade-in">
                    <div className={`
                      w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0
                      ${config.bgColor} ${config.borderColor} border
                    `}>
                      {config.emoji}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className={`text-xs font-bold ${config.textColor} px-1`}>
                        {config.label}
                      </span>
                      <div className="bg-bg-elevated border border-border rounded-2xl rounded-tl-md px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className={`bounce-loader ${config.textColor}`}>
                            <span className="!bg-current"></span>
                            <span className="!bg-current"></span>
                            <span className="!bg-current"></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

            <div ref={messagesEndRef} />
          </div>
        )}
        </div>
      </div>

      {/* Input Area - Either pending gate approval or chat input */}
      {pendingGate ? (
        <div className="flex-shrink-0 border-t border-orange/30 bg-bg-secondary/80 backdrop-blur-sm p-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            {/* Artifact Button(s) */}
            {pendingGateArtifacts.length > 0 && (
              <div className="flex gap-2">
                {pendingGateArtifacts.map(artifact => (
                  <button
                    key={artifact._id}
                    onClick={() => setViewingArtifact(artifact)}
                    className="
                      group flex items-center gap-2 h-[46px] px-3 rounded-lg
                      bg-[#8B5CF6]/10 border border-[#8B5CF6]/30
                      hover:bg-[#8B5CF6]/20 hover:border-[#8B5CF6]/50
                      transition-all text-left
                    "
                  >
                    <span className="text-base group-hover:scale-110 transition-transform">📋</span>
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-[#A78BFA] leading-tight">
                        {artifact.type.replace('_', ' ')}
                      </span>
                      <span className="block text-xs font-semibold text-text-primary truncate max-w-[120px] leading-tight">
                        {artifact.name}
                      </span>
                    </div>
                    <span className="text-[#A78BFA] group-hover:translate-x-0.5 transition-transform">→</span>
                  </button>
                ))}
              </div>
            )}

            {/* Feedback Input */}
            <input
              type="text"
              value={gateComment}
              onChange={(e) => setGateComment(e.target.value)}
              placeholder="Feedback (required for changes)..."
              className="
                flex-1 h-[46px] bg-bg-primary border border-border rounded-lg px-3
                text-sm text-text-primary placeholder:text-text-muted
                focus:outline-none focus:border-orange/50 focus:ring-1 focus:ring-orange/10
                transition-all
              "
            />

            {/* Action Buttons */}
            <button
              onClick={() => {
                onResolveGate(pendingGate._id, 'approved', gateComment || undefined);
                setGateComment('');
              }}
              className="
                h-[46px] px-4 rounded-lg font-bold text-sm
                bg-green/15 text-green border border-green/30
                hover:bg-green/25 hover:border-green/40
                active:scale-[0.98] transition-all flex items-center gap-1.5
              "
            >
              <span>✓</span>
              <span>Approve</span>
            </button>
            <button
              onClick={() => {
                onResolveGate(pendingGate._id, 'changes_requested', gateComment);
                setGateComment('');
              }}
              disabled={!gateComment.trim()}
              className="
                h-[46px] px-4 rounded-lg font-bold text-sm
                bg-bg-elevated border border-border text-text-secondary
                hover:bg-golden/10 hover:text-golden hover:border-golden/40
                disabled:opacity-40 disabled:cursor-not-allowed
                active:scale-[0.98] transition-all flex items-center gap-1.5
              "
              title={!gateComment.trim() ? 'Add feedback to request changes' : ''}
            >
              <span>↻</span>
              <span>Changes</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 border-t border-border bg-bg-secondary/30 p-4">
          <form
            className="max-w-3xl mx-auto flex items-center gap-3"
            onSubmit={handleSubmit}
          >
            <div className="w-9 h-9 rounded-xl bg-bg-hover border border-border flex items-center justify-center text-lg flex-shrink-0">
              👤
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isAnyWorking ? 'Team is working...' : 'Message your team...'}
              disabled={isAnyWorking}
              className="
                flex-1 h-[46px] bg-bg-primary border border-border rounded-xl px-4
                text-sm text-text-primary placeholder:text-text-muted
                focus:outline-none focus:border-orange/60 focus:ring-2 focus:ring-orange/15
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all
              "
            />
            <button
              type="submit"
              disabled={!input.trim() || isAnyWorking}
              className="
                w-[46px] h-[46px] flex items-center justify-center
                bg-orange hover:bg-orange-dark active:scale-95
                text-white rounded-xl font-bold text-lg
                transition-all duration-150
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              →
            </button>
          </form>
        </div>
      )}

      {/* Agent Detail Modal */}
      {selectedAgentType && selectedConfig && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-modal-fade"
          onClick={() => setSelectedAgentType(null)}
        >
          <div
            className="w-full max-w-lg bg-bg-elevated border border-border rounded-2xl overflow-hidden shadow-modal animate-modal-slide"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`
              flex items-center justify-between p-5 border-b border-border
              bg-gradient-to-r from-transparent ${selectedConfig.bgColor.replace('bg-', 'to-')}/50
            `}>
              <div className="flex items-center gap-3">
                <div className={`
                  w-12 h-12 rounded-xl flex items-center justify-center text-2xl
                  ${selectedConfig.bgColor} ${selectedConfig.borderColor} border
                `}>
                  {selectedConfig.emoji}
                </div>
                <div>
                  <h2 className={`text-lg font-bold ${selectedConfig.textColor}`}>
                    {selectedConfig.label}
                  </h2>
                  <div className={`
                    inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide mt-1
                    ${selectedAgent
                      ? selectedAgent.agent.status === 'thinking'
                        ? 'bg-orange/15 text-orange border border-orange/25'
                        : selectedAgent.agent.status === 'idle'
                        ? 'bg-green/15 text-green border border-green/25'
                        : 'bg-text-muted/15 text-text-muted border border-text-muted/25'
                      : 'bg-text-muted/10 text-text-muted border border-text-muted/20'
                    }
                  `}>
                    <span className={`
                      w-1.5 h-1.5 rounded-full
                      ${selectedAgent
                        ? selectedAgent.agent.status === 'thinking'
                          ? 'bg-orange animate-pulse'
                          : selectedAgent.agent.status === 'idle'
                          ? 'bg-green'
                          : 'bg-text-muted'
                        : 'bg-text-muted/50'
                      }
                    `} />
                    {selectedAgent
                      ? selectedAgent.agent.status === 'thinking' ? 'Working' : 'Ready'
                      : 'Idle'
                    }
                  </div>
                </div>
              </div>
              <button
                className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-all"
                onClick={() => setSelectedAgentType(null)}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Description */}
              <div>
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">Role</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {selectedConfig.description}
                </p>
              </div>

              {/* Stats */}
              {selectedAgent && (
                <div>
                  <h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">Session</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-bg-primary rounded-lg p-3 border border-border">
                      <div className="text-2xl font-bold text-text-primary">
                        {selectedAgent.agent.messages.filter(m => m.role === 'assistant').length}
                      </div>
                      <div className="text-xs text-text-muted">Messages</div>
                    </div>
                    <div className="bg-bg-primary rounded-lg p-3 border border-border">
                      <div className="text-2xl font-bold text-text-primary">
                        {selectedAgent.agent.messages.filter(m => m.role === 'tool' && m.toolName).length}
                      </div>
                      <div className="text-xs text-text-muted">Tool Calls</div>
                    </div>
                  </div>
                </div>
              )}

              {!selectedAgent && (
                <div className="bg-bg-primary rounded-lg p-4 border border-border text-center">
                  <p className="text-sm text-text-muted">
                    This agent hasn't been spawned yet. The EM will activate them when needed.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Artifact Viewing Modal */}
      <ArtifactModal
        artifact={viewingArtifact}
        onClose={() => setViewingArtifact(null)}
        gate={pendingGate}
        gateComment={gateComment}
        onGateCommentChange={setGateComment}
        onResolveGate={(gateId, status, comment) => {
          onResolveGate(gateId, status, comment);
          setGateComment('');
        }}
      />
    </div>
  );
}
