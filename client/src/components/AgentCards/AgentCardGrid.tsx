import { AgentCard } from './AgentCard';
import type { AgentCardGridProps } from './types';

export function AgentCardGrid({ agents, onSelectAgent }: AgentCardGridProps) {
  // Separate primary (EM) from worker agents
  const primaryAgent = agents.find(a => a.isPrimary);
  const workerAgents = agents.filter(a => !a.isPrimary);

  // Sort workers: working first, then paused, then idle, then error
  const statusOrder = { working: 0, paused: 1, idle: 2, error: 3 };
  const sortedWorkers = [...workerAgents].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status]
  );

  if (agents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-orange/10 border border-orange/20 flex items-center justify-center text-3xl mb-4 opacity-50">
          👥
        </div>
        <p className="text-sm text-text-muted">No agents active</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Primary Agent (EM) - Full width prominent card */}
        {primaryAgent && (
          <div className="animate-fade-in">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2 px-1">
              Project Lead
            </div>
            <AgentCard
              agent={primaryAgent}
              onClick={() => onSelectAgent(primaryAgent.id)}
            />
          </div>
        )}

        {/* Worker Agents Grid */}
        {sortedWorkers.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2 px-1 flex items-center gap-2">
              <span>Team Members</span>
              <span className="text-orange">{sortedWorkers.length}</span>
            </div>
            <div className={`grid gap-3 ${sortedWorkers.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {sortedWorkers.map((agent, idx) => (
                <div
                  key={agent.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${0.05 * (idx + 1)}s` }}
                >
                  <AgentCard
                    agent={agent}
                    onClick={() => onSelectAgent(agent.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Stats Footer */}
        <div className="pt-4 border-t border-border/50 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-center gap-6 text-xs text-text-muted">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
              <span>{agents.filter(a => a.status === 'working').length} working</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FBBF24]" />
              <span>{agents.filter(a => a.status === 'paused').length} paused</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-text-muted" />
              <span>{agents.filter(a => a.status === 'idle').length} idle</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
