interface ArtifactsTabProps {
  count: number;
  isOpen: boolean;
  onClick: () => void;
}

export function ArtifactsTab({ count, isOpen, onClick }: ArtifactsTabProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-2.5 py-1.5 rounded-lg border flex-shrink-0
        transition-all duration-200 hover:scale-105
        ${isOpen
          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50'
          : 'bg-[#8B5CF6]/10 border-[#8B5CF6]/30'
        }
      `}
    >
      <span className="text-base">📦</span>
      <span className="text-[11px] font-bold text-[#A78BFA]">
        Artifacts
      </span>
      <span className={`
        min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold
        flex items-center justify-center
        ${isOpen
          ? 'bg-[#8B5CF6]/30 text-[#A78BFA]'
          : 'bg-[#8B5CF6]/20 text-[#A78BFA]/80'
        }
      `}>
        {count}
      </span>
    </button>
  );
}
