import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getLiveServerUrl } from '@/lib/liveServer';

interface LiveStatus {
  isLive: boolean;
  viewerCount: number;
  broadcaster?: string;
}

export const useLiveStatus = (matchId: string) => {
  const liveServerUrl = getLiveServerUrl();
  const [liveStatus, setLiveStatus] = useState<LiveStatus>({
    isLive: false,
    viewerCount: 0
  });
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [liveServerAvailable, setLiveServerAvailable] = useState(true);

  useEffect(() => {
    if (!liveServerAvailable) {
      return;
    }

    const newSocket = io(liveServerUrl, {
      reconnectionAttempts: 2,
      reconnectionDelay: 1500,
      timeout: 3000,
    });
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect_error', () => {
      setLiveServerAvailable(false);
      newSocket.disconnect();
    });

    newSocket.on('connect', () => {
      newSocket.emit('join-match', matchId);
    });

    newSocket.on('live-started', ({ matchId: liveMatchId, broadcaster }) => {
      if (liveMatchId === matchId) {
        setLiveStatus(prev => ({
          ...prev,
          isLive: true,
          broadcaster
        }));
      }
    });

    newSocket.on('live-stopped', ({ matchId: liveMatchId }) => {
      if (liveMatchId === matchId) {
        setLiveStatus({
          isLive: false,
          viewerCount: 0
        });
      }
    });

    newSocket.on('viewer-count', ({ matchId: liveMatchId, viewerCount }) => {
      if (liveMatchId === matchId) {
        setLiveStatus(prev => ({
          ...prev,
          viewerCount
        }));
      }
    });

    // Verificar status inicial
    const checkStatus = async () => {
      try {
        const response = await fetch(`${liveServerUrl}/api/live-status/${matchId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const status = await response.json();
        setLiveStatus(status);
      } catch (error) {
        setLiveServerAvailable(false);
      }
    };

    checkStatus();

    return () => {
      socketRef.current = null;
      newSocket.disconnect();
    };
  }, [liveServerUrl, matchId]);

  const ensureSocketConnected = async () => {
    const currentSocket = socketRef.current;

    if (!currentSocket) {
      return false;
    }

    if (currentSocket.connected) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        currentSocket.off('connect', onConnect);
        currentSocket.off('connect_error', onConnectError);
        resolve(false);
      }, 5000);

      const onConnect = () => {
        clearTimeout(timeout);
        currentSocket.off('connect_error', onConnectError);
        resolve(true);
      };

      const onConnectError = () => {
        clearTimeout(timeout);
        currentSocket.off('connect', onConnect);
        resolve(false);
      };

      currentSocket.once('connect', onConnect);
      currentSocket.once('connect_error', onConnectError);
      currentSocket.connect();
    });
  };

  const startLive = async () => {
    const connected = await ensureSocketConnected();
    if (!connected) {
      return;
    }

    socketRef.current?.emit('join-match', matchId);
    socketRef.current?.emit('start-live', matchId);
  };

  const stopLive = async () => {
    const connected = await ensureSocketConnected();
    if (!connected) {
      return;
    }

    socketRef.current?.emit('stop-live', matchId);
  };

  return {
    ...liveStatus,
    startLive,
    stopLive,
    socket
  };
};