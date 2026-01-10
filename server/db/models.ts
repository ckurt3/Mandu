import { ObjectId } from 'mongodb';

// Project - container for work
export interface Project {
  _id?: ObjectId;
  name: string;
  description: string;
  cwd: string;
  status: 'active' | 'archived';
  emAgentId?: string;
  emSessionId?: string; // Claude SDK session ID for resumption
  createdAt: Date;
  updatedAt: Date;
}

// Task - work item for an agent
export interface Task {
  _id?: ObjectId;
  projectId: ObjectId;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assignedAgent: AgentType;
  agentSessionId?: string;
  context?: string;
  result?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Gate - approval checkpoint
export interface Gate {
  _id?: ObjectId;
  projectId: ObjectId;
  taskId: ObjectId;
  title: string;
  description: string;
  status: 'pending' | 'approved' | 'changes_requested';
  artifactIds: ObjectId[];
  requestedBy: string;
  reviewerComment?: string;
  createdAt: Date;
  resolvedAt?: Date;
}

// Artifact - output from an agent
export interface Artifact {
  _id?: ObjectId;
  projectId: ObjectId;
  taskId: ObjectId;
  name: string;
  type: ArtifactType;
  content: string;
  filePath?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// AgentSession - persisted session info for resumption
export interface AgentSessionDoc {
  _id?: ObjectId;
  agentId: string;
  sessionId: string; // Claude SDK session ID for resumption
  projectId?: string;
  cwd: string;
  status: 'active' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

export type AgentType = 'em' | 'pm' | 'architect' | 'developer' | 'qa' | 'reviewer';
export type ArtifactType = 'spec' | 'design_doc' | 'code_change' | 'test_report' | 'markdown';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type GateStatus = 'pending' | 'approved' | 'changes_requested';
