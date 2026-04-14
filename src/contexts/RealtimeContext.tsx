import React, { createContext, useContext } from 'react';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

const RealtimeContext = createContext<{}>({});

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Ativar notificações realtime para todos os usuários
  useRealtimeNotifications();

  return (
    <RealtimeContext.Provider value={{}}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used within RealtimeProvider');
  return context;
};