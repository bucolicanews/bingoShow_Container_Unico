import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '@/contexts/GameContext';
import { BingoCell } from '@/components/BingoCell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { gameTypeLabels, checkWin } from '@/utils/bingoUtils';
import { ArrowLeft, Coins, Users, Bot, Loader2, Star, Trophy, AlertTriangle, CheckCircle2, Hand, PartyPopper, Video, VideoOff, ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { playNotificationSound } from '@/utils/soundUtils';
import { WinnerDisplay } from '@/components/WinnerDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { MatchStats } from '@/components/MatchStats';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { BingoCard } from '@/types/bingo';
import { LiveBroadcaster } from '@/components/LiveBroadcaster';
import { LiveViewer } from '@/components/LiveViewer';
import { useLiveStatus } from '@/hooks/useLiveStatus';
import { MatchCommentsPanel } from '@/components/MatchCommentsPanel';
import { TieBreakModal } from '@/components/TieBreakModal';

const MatchView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { matches, getPlayerMatchCards, matchCards, isLoading, setManualMode, toggleManualMark, checkWinState } = useGame();
  const queryClient = useQueryClient();
  const [lastCalledNumber, setLastCalledNumber] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  
  const [confirmManualCard, setConfirmManualCard] = useState<{cardId: string} | null>(null);
  const [showLiveControls, setShowLiveControls] = useState(false);
  const [showAllNumbers, setShowAllNumbers] = useState(false);
  const [tieBreakDetails, setTieBreakDetails] = useState<any>(null);
  
  const { isLive, startLive, stopLive } = useLiveStatus(id || '');
  
  const checkedCardsRef = useRef<Set<string>>(new Set());
  const warnedCardsRef = useRef<Set<string>>(new Set());
  const tieBreakBootstrapRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`match-view-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidas', filter: `id=eq.${id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['matches'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartelas_partida', filter: `match_id=eq.${id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['matchCards'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, queryClient]);

  const match = matches.find(m => m.id === id);
  
  const prevCalledNumbersRef = useRef<number[]>([]);
  const prevWinnersCountRef = useRef<number>(0);
  const prevRoundRef = useRef<number>(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!match) return;

    // Detecção de nova rodada (globo zerou)
    if (match.is_festival && match.current_round !== prevRoundRef.current) {
        setLastCalledNumber(null);
        prevCalledNumbersRef.current = [];
        prevRoundRef.current = match.current_round || 0;
    }

    const currentNumbers = match.called_numbers || [];
    if (currentNumbers.length > prevCalledNumbersRef.current.length) {
      const newNumber = currentNumbers[currentNumbers.length - 1];
      setLastCalledNumber(newNumber);
      if (match.status !== 'finished') {
        toast.info(`Número sorteado: ${newNumber}!`, { duration: 2000 });
        playNotificationSound();
      }
    }
    prevCalledNumbersRef.current = currentNumbers;

    const winners = match.winners || [];
    if (winners.length > prevWinnersCountRef.current) {
      const latestWinner = winners[winners.length - 1];
      const isFunWinner = (latestWinner as any).creditType === 'fake';

      if (isFunWinner && match.status !== 'finished') {
        toast.success(`BINGO DE BRINCAR!`, {
          description: `${latestWinner.playerName} bateu com a cartela "${latestWinner.cardName}". O jogo continua para o prêmio real!`,
          duration: 6000,
        });
        playNotificationSound();
      } else if (match.status === 'finished') {
        toast.success('BINGO!', {
          description: `Parabéns aos vencedores!`,
          duration: 10000,
        });
        playNotificationSound();
      }
    }
    prevWinnersCountRef.current = winners.length;

  }, [match]);

  useEffect(() => {
    if (!match || !profile) return;
    if (match.status !== 'in_progress') return;

    const myCurrentCards = getPlayerMatchCards(match.id, profile.id);

    myCurrentCards.forEach(card => {
        if (card.marking_mode === 'manual') {
            const tempCard: BingoCard = {
                id: card.id,
                name: card.name,
                numbers: card.numbers,
                markedNumbers: card.marked_numbers,
            };
            const winResult = checkWin(tempCard, match.game_type);

            if (winResult) {
                const calledNumbers = new Set(match.called_numbers);
                const winningNumbers = winResult.winningNumbers.filter(n => n !== 0);
                const uncalledNumbers = winningNumbers.filter(n => !calledNumbers.has(n));

                if (uncalledNumbers.length > 0) {
                    if (!warnedCardsRef.current.has(card.id)) {
                        toast.error("Bingo Inválido!", {
                            description: `Reveja sua cartela. Você marcou números que ainda não saíram: ${uncalledNumbers.join(', ')}.`,
                            duration: 6000,
                        });
                        warnedCardsRef.current.add(card.id);
                    }
                } else {
                    warnedCardsRef.current.delete(card.id);
                    if (!checkedCardsRef.current.has(card.id)) {
                        checkedCardsRef.current.add(card.id);
                        checkWinState(match.id);
                    }
                }
            }
        }
    });
  }, [matchCards, match, profile, checkWinState]);

  useEffect(() => {
    if (!match || (match.status !== 'in_progress' && match.status !== 'finished')) return;

    const realWinners = (match.winners || []).filter((w: any) => w.creditType === 'real');
    const uniqueWinnerIds = Array.from(new Set(realWinners.map((w: any) => w.playerId).filter(Boolean)));
    const alreadyPending = match.tie_break_status === 'pending' || match.tie_break_status === 'resolved';

    if (uniqueWinnerIds.length < 2 || alreadyPending) return;

    const bootstrapKey = `${match.id}:${uniqueWinnerIds.sort().join(',')}`;
    if (tieBreakBootstrapRef.current.has(bootstrapKey)) return;
    tieBreakBootstrapRef.current.add(bootstrapKey);

    (async () => {
      const { data, error } = await supabase.rpc('create_tie_break_session', {
        p_match_id: match.id,
        p_player_ids: uniqueWinnerIds,
      });

      if (error || !data?.success) {
        tieBreakBootstrapRef.current.delete(bootstrapKey);
        console.error('[tie-break] Falha ao iniciar desempate automaticamente:', error?.message || data?.error);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.info('Empate detectado. Abrindo votação de desempate...', { duration: 4000 });
    })();
  }, [match, queryClient]);

  useEffect(() => {
    if (!match) return;
    if (match.tie_break_status !== 'resolved') return;
    if (match.status === 'finished') return;

    (async () => {
      const { data, error } = await (supabase as any).rpc('finalize_tie_break_resolution', {
        p_match_id: match.id,
      });

      if (error || !data?.success) {
        console.error('[tie-break] Falha ao finalizar partida resolvida:', error?.message || data?.error);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success('Desempate finalizado. Partida encerrada.');
    })();
  }, [match, queryClient]);

  // Buscar informações detalhadas do desempate
  useEffect(() => {
    if (!match || match.tie_break_status !== 'resolved' || !match.tie_break_session_id) return;

    (async () => {
      const { data, error } = await (supabase as any).rpc('get_tie_break_session_state', {
        p_match_id: match.id,
      });

      if (!error && data?.success && data?.session) {
        setTieBreakDetails(data.session);
      }
    })();
  }, [match?.tie_break_status, match?.id, match?.tie_break_session_id]);

  const handleCellClick = async (cardId: string, num: number, currentMode: 'auto' | 'manual') => {
    if (!match || match.status !== 'in_progress' || num === 0) return;

    if (currentMode === 'auto') {
        toast.info("Mude para o modo manual para poder marcar.");
        return;
    }
    
    await toggleManualMark(cardId, num);
  };

  const handleConfirmManual = async () => {
    if (confirmManualCard) {
      await setManualMode(confirmManualCard.cardId);
      setConfirmManualCard(null);
    }
  };

  if (isLoading && !match) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-heading">Carregando partida...</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="card-container text-center py-20">
        <p className="text-muted-foreground text-lg">Partida não encontrada.</p>
        <Button className="mt-6 gradient-primary" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao Lobby
        </Button>
      </div>
    );
  }

  const myCards = profile && id ? getPlayerMatchCards(id, profile.id) : [];
  const allCardsForThisMatch = matchCards.filter(c => c.match_id === id);
  const playersInMatchCount = new Set(allCardsForThisMatch.map(mc => mc.player_id)).size;

  // mapa player_id → nome para o modal de desempate
  const tiedPlayerNames: Record<string, string> = {};
  if (match?.tie_break_status === 'pending' || match?.tie_break_status === 'resolved') {
    const tiedWinners = (match.winners || []).filter((w: any) => w.creditType === 'real');
    tiedWinners.forEach((w: any) => { tiedPlayerNames[w.playerId] = w.playerName; });
  }
  const lastCalled = match.called_numbers?.length > 0 ? match.called_numbers[match.called_numbers.length - 1] : null;
  const countdown = match.next_auto_call_timestamp ? Math.max(0, Math.round((new Date(match.next_auto_call_timestamp).getTime() - now) / 1000)) : null;
  const funWinnersInProgress = (match.winners || []).filter(w => (w as any).creditType === 'fake');
  
  const hasMoreRounds = match.is_festival && (match.current_round ?? 0) < (match.prizes?.length || 0) - 1;

  return (
    <>
      <div className="gradient-hero py-4 px-4 -mt-6 sm:-mt-8 -mx-4 mb-6 rounded-b-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" className="text-primary-foreground" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-heading text-lg sm:text-xl font-bold text-primary-foreground">
                {match.name}
              </h1>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-primary-foreground/70 text-xs mt-0.5">
                <span>{gameTypeLabels[match.game_type]}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{playersInMatchCount}</span>
                {!match.is_festival && <span className="flex items-center gap-1"><Coins className="w-3 h-3" />Pote: {Number(match.pot || 0).toFixed(2)}</span>}
              </div>
            </div>
          </div>
          {lastCalled && (
            <div className="bingo-ball animate-bounce-in text-xl w-12 h-12 sm:w-14 sm:h-14" key={lastCalled}>
              {lastCalled}
            </div>
          )}
        </div>
      </div>

      {match.status !== 'finished' && (
        <MatchStats match={match} allMatchCards={allCardsForThisMatch} />
      )}

      {/* CONTROLES DE LIVE PARA ADMIN */}
      {profile?.role === 'admin' && (
        <div className="card-container mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-red-500" />
              <span className="font-medium">Transmissão ao Vivo</span>
              {isLive && (
                <Badge variant="destructive" className="animate-pulse">
                  🔴 AO VIVO
                </Badge>
              )}
            </div>
            <Button
              onClick={() => setShowLiveControls(!showLiveControls)}
              variant={isLive ? "destructive" : "default"}
              size="sm"
            >
              {isLive ? <VideoOff className="w-4 h-4 mr-2" /> : <Video className="w-4 h-4 mr-2" />}
              {isLive ? 'Parar Live' : 'Iniciar Live'}
            </Button>
          </div>

          {showLiveControls && (
            <div className="mt-4">
              <LiveBroadcaster matchId={id || ''} />
            </div>
          )}
        </div>
      )}

      {/* VISUALIZAÇÃO DA LIVE PARA USUÁRIOS */}
      {isLive && profile?.role !== 'admin' && (
        <div className="card-container mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Video className="w-5 h-5 text-red-500" />
            <span className="font-medium">Transmissão ao Vivo</span>
            <Badge variant="destructive" className="animate-pulse">
              🔴 AO VIVO
            </Badge>
          </div>
          <LiveViewer matchId={id || ''} />
        </div>
      )}

      <div className="card-container mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">Números sorteados ({(match.called_numbers || []).length})</p>
          {(match.called_numbers || []).length > 10 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllNumbers(!showAllNumbers)}
              className="text-xs h-6 px-2"
            >
              {showAllNumbers ? (
                <>
                  <ChevronUp className="w-3 h-3 mr-1" />
                  Mostrar menos
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3 mr-1" />
                  Ver todos
                </>
              )}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(showAllNumbers ? [...(match.called_numbers || [])].reverse() : [...(match.called_numbers || [])].reverse().slice(0, 10)).map((num, idx) => (
            <span key={num} className={`w-8 h-8 rounded-full text-sm font-medium flex items-center justify-center transition-all ${idx === 0 ? 'bg-accent text-accent-foreground border-2 border-accent scale-110 animate-pulse shadow-lg' : 'bg-primary text-primary-foreground'}`}>
              {num}
            </span>
          ))}
          {(match.called_numbers || []).length === 0 && (
             <span className="text-xs text-muted-foreground italic py-2">Nenhuma bola sorteada nesta rodada ainda.</span>
          )}
          {!showAllNumbers && (match.called_numbers || []).length > 10 && (
            <span className="text-xs text-muted-foreground italic py-2 flex items-center">
              ... e mais {(match.called_numbers || []).length - 10} números
            </span>
          )}
        </div>
      </div>

      {match.status === 'in_progress' && funWinnersInProgress.length > 0 && (
        <Alert className="mb-6 border-amber-500 bg-amber-500/10 text-amber-700 animate-pulse">
          <Star className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-heading font-bold">Bingo de Brincar!</AlertTitle>
          <AlertDescription className="text-xs">
            {funWinnersInProgress.map(w => w.playerName).join(', ')} já bateu Bingo de brincar. 
            <strong> O jogo continua valendo o prêmio real!</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* AVISO DO FESTIVAL: PREPARANDO PRÓXIMA RODADA */}
      {match.status === 'finished' && hasMoreRounds && (
         <div className="card-container text-center bg-purple-600 border-purple-800 text-white mb-6 p-6 animate-pulse">
            <PartyPopper className="w-12 h-12 mx-auto mb-3 opacity-90" />
            <h2 className="text-xl font-black font-heading uppercase">Rodada Encerrada!</h2>
            <p className="font-medium opacity-90 mt-2">Não rasgue sua cartela. Aguarde o locutor limpar o globo para sortear o próximo prêmio!</p>
         </div>
      )}

      <WinnerDisplay match={match} allMatchCards={allCardsForThisMatch} />

      {/* DETALHES DO DESEMPATE */}
      {match.tie_break_status === 'resolved' && (
        <div className="card-container mb-6 border-2 border-amber-500/30 bg-amber-50/30">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-amber-600" />
            <h3 className="font-heading font-bold text-amber-900">Desempate Resolvido</h3>
          </div>
          
          {tieBreakDetails && (
            <div className="space-y-3">
              {/* Método de resolução */}
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs text-muted-foreground mb-1">Método de Resolução</p>
                <p className="font-semibold text-sm text-foreground">
                  {tieBreakDetails.selected_resolution === 'split_prize' && '💰 Prêmio Dividido'}
                  {tieBreakDetails.selected_resolution === 'random_number' && '🎲 Número Aleatório'}
                  {tieBreakDetails.selected_resolution === 'rematch' && '🔄 Nova Partida'}
                </p>
              </div>

              {/* Detalhes por método */}
              {tieBreakDetails.selected_resolution === 'split_prize' && tieBreakDetails.resolution_payload?.splitPerPlayer && (
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  <p className="text-xs text-muted-foreground mb-1">Valor por Ganhador</p>
                  <p className="font-bold text-base text-green-600">
                    {Number(tieBreakDetails.resolution_payload.splitPerPlayer).toFixed(2)} créditos
                  </p>
                </div>
              )}

              {tieBreakDetails.selected_resolution === 'random_number' && tieBreakDetails.resolution_payload?.winningNumber && (
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  <p className="text-xs text-muted-foreground mb-1">Número Vencedor</p>
                  <p className="font-bold text-base text-green-600">
                    {tieBreakDetails.resolution_payload.winningNumber}
                  </p>
                </div>
              )}

              {tieBreakDetails.selected_resolution === 'rematch' && tieBreakDetails.resolution_payload?.rematchMatchId && (
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  <p className="text-xs text-muted-foreground mb-1">Nova Partida Criada</p>
                  <p className="font-semibold text-sm text-foreground">
                    ID: {tieBreakDetails.resolution_payload.rematchMatchId.slice(0, 8)}...
                  </p>
                </div>
              )}

              {/* Data da resolução */}
              <div className="text-xs text-muted-foreground text-right">
                Resolvido em {new Date().toLocaleTimeString('pt-BR')}
              </div>
            </div>
          )}
        </div>
      )}

      {match.status !== 'finished' && match.is_auto_calling && (
        <div className="card-container mb-6 bg-accent/10 text-accent text-center p-4">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <p className="font-medium text-sm flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Sorteio automático ativado!
            </p>
            {countdown !== null && (
              <div className="flex items-center gap-2">
                <span className="text-sm">Próximo número em:</span>
                <span className="font-bold font-mono text-lg bg-accent text-accent-foreground rounded-md px-2 py-1">
                  {countdown}s
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg font-bold text-foreground">
            Minhas Cartelas ({myCards.length})
        </h2>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full border border-border/50 hidden sm:flex">
            <Hand className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Clique no número para marcar manual</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {myCards.map((card) => {
          const mode = card.marking_mode || 'auto';
          return (
            <div key={card.id} className={cn(
                "card-container max-w-sm mx-auto w-full border-2 transition-all relative",
                mode === 'manual' ? "border-amber-500/30 shadow-amber-500/5" : "border-transparent"
            )}>
              <div className="flex items-center justify-between mb-4">
                <div className="min-w-0">
                    <h3 className="font-heading font-semibold text-foreground flex items-center gap-2 truncate">
                        {card.name}
                        {card.credit_type === 'fake' && <Badge variant="outline" className="text-[9px] h-4 border-amber-400 text-amber-600">Brincar</Badge>}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                            mode === 'auto' ? "bg-primary/10 text-primary" : "bg-amber-500 text-white animate-pulse"
                        )}>
                            {mode === 'auto' ? 'Automático' : 'MODO MANUAL'}
                        </span>
                    </div>
                </div>
                
                <div className="flex flex-col items-end gap-1">
                    <Label htmlFor={`mode-${card.id}`} className="text-[8px] uppercase font-bold text-muted-foreground">Trocar p/ Manual</Label>
                    <Switch 
                        id={`mode-${card.id}`}
                        checked={mode === 'manual'}
                        disabled={mode === 'manual' || match.status === 'finished'}
                        onCheckedChange={() => mode === 'auto' && setConfirmManualCard({ cardId: card.id })}
                    />
                </div>
              </div>
              
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {['B', 'I', 'N', 'G', 'O'].map(letter => (
                  <div key={letter} className="w-full aspect-square rounded-lg flex items-center justify-center text-sm sm:text-lg font-heading font-bold gradient-primary text-primary-foreground shadow-sm">
                    {letter}
                  </div>
                ))}
                {card.numbers.flat().map((num, i) => {
                    const isMarked = card.marked_numbers instanceof Set 
                        ? card.marked_numbers.has(num) 
                        : Array.isArray(card.marked_numbers) && card.marked_numbers.includes(num);
                        
                    return (
                        <BingoCell
                            key={`${card.id}-${i}`}
                            number={num}
                            isMarked={isMarked}
                            isFreeSpace={i === 12}
                            isNewlyMarked={isMarked && num === lastCalledNumber}
                            onClick={() => handleCellClick(card.id, num, mode)}
                        />
                    )
                })}
              </div>
              
              {mode === 'manual' && match.status === 'in_progress' && (
                <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-800 font-medium leading-tight">
                        Você assumiu a marcação. Fique atento aos números sorteados para não passar batido!
                    </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <MatchCommentsPanel
        matchId={id || ''}
        canSend={match.status === 'open' || match.status === 'in_progress'}
      />

      {(match?.tie_break_status === 'pending' || match?.tie_break_status === 'resolved') && id && (
        <TieBreakModal 
          matchId={id} 
          playerNames={tiedPlayerNames} 
          winners={match.winners || []}
          isLive={isLive}
          isAutomatic={match.is_auto_calling ?? false}
        />
      )}

      <AlertDialog open={!!confirmManualCard} onOpenChange={(open) => !open && setConfirmManualCard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
                Mudar para Marcação Manual?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-bold text-foreground">
                Uma vez que você marcar manualmente, esta cartela deixará de ser marcada automaticamente pelo sistema!
              </p>
              <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-destructive font-semibold text-sm">
                "Você terá que marcar os números manualmente caso deixe de marcar você passará batido."
              </div>
              <p>Deseja continuar e assumir o controle desta cartela agora?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmManual} className="bg-amber-600 hover:bg-amber-700">
                Sim, quero marcar manual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MatchView;