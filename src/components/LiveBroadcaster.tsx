import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { getLiveServerUrl } from '@/lib/liveServer';

interface LiveBroadcasterProps {
  matchId: string;
  onClose?: () => void;
}

export const LiveBroadcaster: React.FC<LiveBroadcasterProps> = ({ matchId, onClose }) => {
  const liveServerUrl = getLiveServerUrl();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const [isStreaming, setIsStreaming] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    // Conectar ao servidor Socket.IO
    socketRef.current = io(liveServerUrl);

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Conectado ao servidor de live');
      socket.emit('join-match', matchId);
    });

    socket.on('watcher', (id) => {
      console.log('Novo viewer:', id);
      createPeerConnection(id);
    });

    socket.on('answer', (id, description) => {
      const peerConnection = peerConnectionsRef.current.get(id);
      if (!peerConnection) return;

      peerConnection.setRemoteDescription(new RTCSessionDescription(description))
        .catch(error => console.error('Erro ao aplicar answer:', error));
    });

    socket.on('candidate', (id, candidate) => {
      const peerConnection = peerConnectionsRef.current.get(id);
      if (!peerConnection || !candidate) return;

      peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(error => console.error('Erro ao adicionar candidate no broadcaster:', error));
    });

    socket.on('viewer-count', ({ matchId: liveMatchId, viewerCount: total }) => {
      if (liveMatchId === matchId) {
        setViewerCount(total);
      }
    });

    socket.on('disconnect', () => {
      console.log('Desconectado do servidor');
      stopStreaming();
    });

    return () => {
      socket.disconnect();
      stopStreaming();
    };
  }, [liveServerUrl, matchId]);

  const createPeerConnection = (viewerId: string) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    peerConnectionsRef.current.set(viewerId, peerConnection);

    // Adicionar tracks do stream local
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, streamRef.current!);
      });
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('candidate', viewerId, event.candidate);
      }
    };

    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        socketRef.current?.emit('offer', viewerId, peerConnection.localDescription);
      })
      .catch(error => console.error('Erro ao criar oferta:', error));
  };

  const waitForSocketConnection = () => {
    return new Promise<void>((resolve, reject) => {
      const socket = socketRef.current;

      if (!socket) {
        reject(new Error('Socket não inicializado'));
        return;
      }

      if (socket.connected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        socket.off('connect', onConnect);
        socket.off('connect_error', onConnectError);
        reject(new Error('Timeout de conexão com servidor de live'));
      }, 5000);

      const onConnect = () => {
        clearTimeout(timeout);
        socket.off('connect_error', onConnectError);
        resolve();
      };

      const onConnectError = () => {
        clearTimeout(timeout);
        socket.off('connect', onConnect);
        reject(new Error('Falha ao conectar no servidor de live'));
      };

      socket.once('connect', onConnect);
      socket.once('connect_error', onConnectError);
      socket.connect();
    });
  };

  const startStreaming = async () => {
    if (isStarting || isStreaming) {
      return;
    }

    setIsStarting(true);

    try {
      const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
      const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';

      if (!hasGetUserMedia) {
        const isSecureOrigin = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (!isSecureOrigin) {
          throw new Error('BROWSER_INSECURE_CONTEXT');
        }

        throw new Error('BROWSER_NO_MEDIA_DEVICES');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      await waitForSocketConnection();

      socketRef.current?.emit('join-match', matchId);
      socketRef.current?.emit('broadcaster', matchId);
      socketRef.current?.emit('start-live', matchId);

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsStreaming(true);

      toast.success('Transmissão ao vivo iniciada!');
    } catch (error) {
      console.error('Erro ao iniciar transmissão ao vivo:', error);

      if (error instanceof Error && error.message === 'BROWSER_INSECURE_CONTEXT') {
        toast.error('Live exige HTTPS (ou localhost). Abra em https://seu-dominio ou em http://localhost para liberar câmera/microfone.');
      } else if (error instanceof Error && error.message === 'BROWSER_NO_MEDIA_DEVICES') {
        toast.error('Seu navegador/dispositivo não expõe câmera/microfone para este site. Teste em navegador atualizado.');
      } else {
        toast.error('Não foi possível iniciar a live. Verifique câmera, microfone e conexão com o servidor.');
      }
    } finally {
      setIsStarting(false);
    }
  };

  const stopStreaming = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Fechar todas as conexões peer
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setViewerCount(0);
    socketRef.current?.emit('stop-live', matchId);
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="w-5 h-5 text-red-500" />
          Transmissão ao Vivo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg bg-black"
            style={{ aspectRatio: '16/9' }}
          />
          {isStreaming && (
            <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-sm font-bold animate-pulse">
              🔴 AO VIVO
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-center">
          {!isStreaming ? (
            <Button onClick={startStreaming} className="bg-red-500 hover:bg-red-600" disabled={isStarting}>
              <Video className="w-4 h-4 mr-2" />
              {isStarting ? 'Iniciando...' : 'Iniciar Live'}
            </Button>
          ) : (
            <>
              <Button
                onClick={toggleVideo}
                variant={isVideoEnabled ? "default" : "secondary"}
                size="sm"
              >
                {isVideoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </Button>
              <Button
                onClick={toggleAudio}
                variant={isAudioEnabled ? "default" : "secondary"}
                size="sm"
              >
                {isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </Button>
              <Button onClick={stopStreaming} variant="destructive">
                <VideoOff className="w-4 h-4 mr-2" />
                Parar Live
              </Button>
            </>
          )}
        </div>

        {isStreaming && (
          <div className="text-center text-sm text-muted-foreground">
            Transmitindo para {viewerCount} espectadores
          </div>
        )}
      </CardContent>
    </Card>
  );
};