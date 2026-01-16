import { ALL_AGENT_TYPES, AGENT_CONFIG } from '../constants';
import type { AgentWithType } from '../types';
import { ArtifactsTab } from '../../ArtifactsTab';
import type { Artifact } from '@shared/types';

interface AgentStatusBarProps {
  agents: AgentWithType[];
  agentsByType: Map<string, AgentWithType>;
  artifacts: Artifact[];
  artifactsPanelOpen: boolean;
  onToggleArtifactsPanel: () => void;
  onSelectAgent: (type: string) => void;
}

export function AgentStatusBar({
  agentsByType,
  artifacts,
  artifactsPanelOpen,
  onToggleArtifactsPanel,
  onSelectAgent,
}: AgentStatusBarProps) {
  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border bg-bg-secondary/80 backdrop-blur-sm">
      {/* Artifacts Tab - only show when artifacts exist */}
      {artifacts.length > 0 && (
        <ArtifactsTab
          count={artifacts.length}
          isOpen={artifactsPanelOpen}
          onClick={onToggleArtifactsPanel}
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
              onClick={() => onSelectAgent(type)}
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
  );
}
