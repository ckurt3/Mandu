export const MAX_IMAGE_DIMENSION = 768;
export const IMAGE_QUALITY = 0.7;
export const MAX_TEXT_FILE_SIZE = 100 * 1024;

export const SUPPORTED_TEXT_EXTENSIONS = [
  '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.css', '.html',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.yml', '.yaml', '.toml', '.xml', '.csv', '.sh', '.bash', '.zsh'
];

export const ALL_AGENT_TYPES = ['em', 'pm', 'architect', 'developer', 'qa', 'reviewer', 'release-manager'] as const;

export type AgentType = typeof ALL_AGENT_TYPES[number] | 'user';

export interface AgentConfigItem {
  emoji: string;
  label: string;
  shortLabel: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

export const AGENT_CONFIG: Record<string, AgentConfigItem> = {
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
    description: "That's you!",
  },
};

export interface ToolDisplayConfig {
  icon: string;
  label: string;
  textColor: string;
  bgColor: string;
  getDesc?: (input: Record<string, unknown>) => string;
}

export const TOOL_DISPLAY_MAP: Record<string, ToolDisplayConfig> = {
  // Mandu orchestration tools
  'em-orchestra': {
    icon: '◆',
    label: 'EM-DISPATCH',
    textColor: 'text-orange',
    bgColor: 'bg-orange/5',
    getDesc: (i) => i.agentType ? `→ ${String(i.agentType).toUpperCase()}` : ''
  },
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

  // MongoDB tools
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
  'get_file_contents': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#f0f6fc]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.path ? String(i.path).split('/').pop() || '' : '' },
  'create_pull_request': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#238636]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.title ? `PR → ${String(i.title).slice(0, 20)}` : 'create PR' },
  'list_pull_requests': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#f0f6fc]', bgColor: 'bg-[#238636]/10', getDesc: () => 'list PRs' },
  'create_or_update_file': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#238636]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.path ? String(i.path).split('/').pop() || '' : '' },
  'push_files': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#238636]', bgColor: 'bg-[#238636]/10', getDesc: () => 'push files' },
  'create_branch': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#238636]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.branch ? String(i.branch) : '' },
  'search_code': { icon: '⬡', label: 'GITHUB', textColor: 'text-[#f0f6fc]', bgColor: 'bg-[#238636]/10', getDesc: (i) => i.query ? String(i.query).slice(0, 20) : 'search' },
};
