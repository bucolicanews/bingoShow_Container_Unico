import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Card, CardContent } from '@/components/ui/card';
import { Video, Users } from 'lucide-react';
import { getLiveServerUrl } from '@/lib/liveServer';

interface LiveViewerProps {
  matchId: string;
}

export const LiveViewer: React.FC<LiveViewerProps> = ({ matchId }) => {
  const liveServerUrl = getLiveServerUrl();
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const [isWatching, setIsWatching] = useState(false);
  const [isLiveAvailable, setIsLiveAvailable] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  const createPeerConnection = useCallback((broadcasterId: string) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    peerConnectionRef.current = peerConnection;

    peerConnection.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setIsWatching(true);
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('candidate', broadcasterId, event.candidate);
      }
    };

    socketRef.current?.emit('watcher', matchId);
  }, [matchId]);

  useEffect(() => {
    // Conectar ao servidor Socket.IO
    socketRef.current = io(liveServerUrl);

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Conectado ao servidor de live');
      socket.emit('join-match', matchId);
      socket.emit('watch-live', matchId);
    });

    socket.on('can-watch', ({ matchId: liveMatchId, broadcaster }) => {
      if (liveMatchId === matchId) {
        setIsLiveAvailable(true);
        createPeerConnection(broadcaster);
      }
    });

    socket.on('live-not-available', ({ matchId: liveMatchId }) => {
      if (liveMatchId === matchId) {
        setIsLiveAvailable(false);
        setIsWatching(false);
      }
    });

    socket.on('live-started', () => {
      setIsLiveAvailable(true);
      if (socketRef.current) {
        socketRef.current.emit('watch-live', matchId);
      }
    });

    socket.on('viewer-count', ({ matchId: liveMatchId, viewerCount: total }) => {
      if (liveMatchId === matchId) {
        setViewerCount(total);
      }
    });

    socket.on('live-stopped', ({ matchId: liveMatchId }) => {
      if (liveMatchId === matchId) {
        setIsLiveAvailable(false);
        setIsWatching(false);
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }
      }
    });

    socket.on('offer', (broadcasterId, description) => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(description))
          .then(() => peerConnectionRef.current!.createAnswer())
          .then(answer => peerConnectionRef.current!.setLocalDescription(answer))
          .then(() => {
            socket.emit('answer', broadcasterId, peerConnectionRef.current!.localDescription);
          })
          .catch(error => console.error('Erro ao processar oferta:', error));
      } else {
        console.error('Peer connection não existe ao processar offer');
      }
    });

    socket.on('candidate', (id, candidate) => {
      if (peerConnectionRef.current && candidate) {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
          .catch(error => console.error('Erro ao adicionar candidato:', error));
      }
    });

    socket.on('disconnect', () => {
      console.log('Desconectado do servidor');
      setIsWatching(false);
      setIsLiveAvailable(false);
    });

    return () => {
      socket.disconnect();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [createPeerConnection, liveServerUrl, matchId]);

  if (!isLiveAvailable) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6 text-center">
          <Video className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Aguardando transmissão ao vivo...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-4">
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full rounded-lg bg-black"
            style={{ aspectRatio: '16/9' }}
          />
          {isWatching && (
            <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-sm font-bold animate-pulse">
              🔴 AO VIVO
            </div>
          )}
          {isWatching && (
            <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-sm flex items-center gap-1">
              <Users className="w-3 h-3" />
              {viewerCount}
            </div>
          )}
        </div>

        {!isWatching && (
          <div className="text-center mt-4">
            <p className="text-sm text-muted-foreground">
              Conectando à transmissão...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};