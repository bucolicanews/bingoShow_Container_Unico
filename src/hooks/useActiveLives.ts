import { useState, useEffect, useCallback } from 'react';
import { getLiveServerUrl } from '@/lib/liveServer';

interface LiveStatus {
  isLive: boolean;
  viewerCount: number;
  broadcaster?: string;
}

export const useActiveLives = () => {
  const liveServerUrl = getLiveServerUrl();
  const [activeLives, setActiveLives] = useState<Record<string, LiveStatus>>({});

  const checkActiveLives = useCallback(async () => {
    try {
      const response = await fetch(`${liveServerUrl}/api/live-status`);
      const lives = await response.json();
      setActiveLives(lives);
    } catch (error) {
      console.error('Erro ao verificar lives ativas:', error);
    }
  }, [liveServerUrl]);

  useEffect(() => {
    // Verificar status inicial
    checkActiveLives();

    // Verificar a cada 5 segundos
    const interval = setInterval(checkActiveLives, 5000);

    return () => clearInterval(interval);
  }, [checkActiveLives]);

  return activeLives;
};