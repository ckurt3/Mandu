export interface ProjectContext {
  projectId: string;
  cwd: string;
  request: string;
}

export interface EMDecision {
  type: 'spawn_worker' | 'create_gate' | 'complete' | 'fail';
  // For spawn_worker
  agentType?: 'pm' | 'architect' | 'developer' | 'qa' | 'reviewer';
  taskInput?: Record<string, unknown>;
  // For create_gate
  gateType?: string;
  gateTitle?: string;
  gateDescription?: string;
  // For complete/fail
  summary?: string;
  error?: string;
}

// Events that flow into EM's conversation
export type EMEvent =
  | { type: 'user_message'; content: string }
  | { type: 'worker_completed'; taskId: string; agentType: string; summary: string }
  | { type: 'worker_failed'; taskId: string; agentType: string; error: string }
  | { type: 'gate_resolved'; gateId: string; status: 'approved' | 'rejected'; notes?: string };

export interface WorkerResult {
  success: boolean;
  taskId: string;
  summary: string;
  error?: string;
}

export interface SpawnWorkerParams {
  taskId: string;
  projectId: string;
  agentType: 'pm' | 'architect' | 'developer' | 'qa' | 'reviewer';
  input: Record<string, unknown>;
  cwd: string;
  onMessage: (message: string) => void;
  onComplete: (result: WorkerResult) => void;
}
