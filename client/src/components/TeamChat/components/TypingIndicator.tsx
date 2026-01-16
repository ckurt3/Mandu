import { AGENT_CONFIG } from '../constants';

interface TypingIndicatorProps {
  agentType: string;
}

export function TypingIndicator({ agentType }: TypingIndicatorProps) {
  const config = AGENT_CONFIG[agentType] || AGENT_CONFIG.em;

  return (
    <div className="flex gap-3 animate-fade-in-up">
      <div className={`
        w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0
        ${config.bgColor} ${config.borderColor} border animate-pulse-glow
      `}>
        {config.emoji}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={`text-xs font-bold ${config.textColor} px-1`}>
          {config.label}
        </span>
        <div className="bg-bg-elevated border border-border rounded-2xl rounded-tl-sm px-4 py-3 w-fit">
          <div className={`bounce-loader ${config.textColor}`}>
            <span className="!bg-current"></span>
            <span className="!bg-current"></span>
            <span className="!bg-current"></span>
          </div>
        </div>
      </div>
    </div>
  );
}
