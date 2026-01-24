import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { AgentNavigationState, AgentNavigationContextType } from './types';

const AgentNavigationContext = createContext<AgentNavigationContextType | null>(null);

interface AgentNavigationProviderProps {
  children: ReactNode;
}

export function AgentNavigationProvider({ children }: AgentNavigationProviderProps) {
  const [state, setState] = useState<AgentNavigationState>({
    view: 'grid',
    selectedAgentId: null,
  });

  const selectAgent = useCallback((agentId: string) => {
    setState({
      view: 'detail',
      selectedAgentId: agentId,
    });
  }, []);

  const goBack = useCallback(() => {
    setState({
      view: 'grid',
      selectedAgentId: null,
    });
  }, []);

  return (
    <AgentNavigationContext.Provider value={{ state, selectAgent, goBack }}>
      {children}
    </AgentNavigationContext.Provider>
  );
}

export function useAgentNavigation(): AgentNavigationContextType {
  const context = useContext(AgentNavigationContext);
  if (!context) {
    throw new Error('useAgentNavigation must be used within an AgentNavigationProvider');
  }
  return context;
}
