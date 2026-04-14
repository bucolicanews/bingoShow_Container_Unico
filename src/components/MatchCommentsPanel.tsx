import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMatchComments } from '@/hooks/useMatchComments';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface MatchCommentsPanelProps {
  matchId: string;
  canSend: boolean;
}

export const MatchCommentsPanel = ({ matchId, canSend }: MatchCommentsPanelProps) => {
  if (!matchId) return null;

  const { user, profile } = useAuth();
  const { comments, isLoading, isSending, sendComment } = useMatchComments(matchId);
  const [message, setMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [floatingMessages, setFloatingMessages] = useState<Array<{ id: string; sender: string; text: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const previousCountRef = useRef(0);

  const commentsCount = useMemo(() => comments.length, [comments]);

  useEffect(() => {
    if (!isExpanded) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [commentsCount, isExpanded]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      previousCountRef.current = comments.length;
      return;
    }

    if (comments.length <= previousCountRef.current) {
      previousCountRef.current = comments.length;
      return;
    }

    const newItems = comments.slice(previousCountRef.current).slice(-3);
    previousCountRef.current = comments.length;

    if (newItems.length === 0) return;

    const generated = newItems.map((comment, index) => ({
      id: `${comment.id}-${Date.now()}-${index}`,
      sender: comment.sender_id === user?.id
        ? (profile?.role === 'admin' ? 'Voce (Admin)' : 'Voce')
        : (comment.sender_name || 'Participante'),
      text: comment.message,
    }));

    setFloatingMessages((prev) => [...prev, ...generated]);

    generated.forEach((item) => {
      window.setTimeout(() => {
        setFloatingMessages((prev) => prev.filter((bubble) => bubble.id !== item.id));
      }, 3200);
    });
  }, [comments, profile?.role, user?.id]);

  const handleSend = async () => {
    const ok = await sendComment(message);
    if (ok) setMessage('');
  };

  return (
    <>
      <div className="card-container mb-6">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-4 h-4 text-primary" />
          <h3 className="font-heading text-base font-bold">Comentarios da partida</h3>
        </div>

        <div className="space-y-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={canSend ? 'Escreva seu comentario...' : 'Chat bloqueado para partidas finalizadas.'}
          className="min-h-[64px]"
          maxLength={300}
          disabled={!canSend || isSending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend && !isSending && message.trim()) {
                handleSend();
              }
            }
          }}
        />
        <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{message.length}/300</span>
            <Button
              onClick={handleSend}
              disabled={!canSend || isSending || !message.trim()}
              className="h-9"
            >
              {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar
            </Button>
          </div>

          <div className="pt-1 border-t border-border/60">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="h-8 w-full justify-between text-xs"
            >
              <span>{isExpanded ? 'Ocultar mensagens' : 'Abrir mensagens'}</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                {commentsCount} {commentsCount === 1 ? 'mensagem' : 'mensagens'}
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 rounded-xl border bg-muted/20 p-3 h-64 overflow-y-auto space-y-2">
            {isLoading && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Carregando comentarios...
              </div>
            )}

            {!isLoading && commentsCount === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm italic">
                Seja o primeiro a comentar nesta partida.
              </div>
            )}

            {!isLoading && comments.map((comment) => {
              const isMine = comment.sender_id === user?.id;
              const senderLabel = isMine
                ? (profile?.role === 'admin' ? 'Voce (Admin)' : 'Voce')
                : comment.sender_name || 'Participante';

              return (
                <div
                  key={comment.id}
                  className={cn('flex', isMine ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-xl px-3 py-2 border shadow-sm',
                      isMine
                        ? 'bg-primary text-primary-foreground border-primary/30'
                        : 'bg-background border-border'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wide', isMine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                        {senderLabel}
                      </span>
                      <span className={cn('text-[10px]', isMine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                        {new Date(comment.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={cn('text-sm whitespace-pre-wrap break-words', isMine ? 'text-primary-foreground' : 'text-foreground')}>
                      {comment.message}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {floatingMessages.length > 0 && (
        <div className="fixed right-3 bottom-24 z-50 space-y-2 pointer-events-none sm:right-5">
          {floatingMessages.map((item) => (
            <div key={item.id} className="match-comment-float max-w-[70vw] sm:max-w-xs">
              <p className="text-[10px] font-bold uppercase tracking-wide text-primary/80">{item.sender}</p>
              <p className="text-xs text-foreground break-words">{item.text}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
