import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Dices, RefreshCw, DollarSign, AlertTriangle, Trophy, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
type TieOption = 'random_number' | 'rematch' | 'split_prize';

interface TieBreakSession {
  id: string;
  match_id: string;
  status: 'voting' | 'random_pending' | 'resolved' | 'cancelled';
  current_vote_round: number;
  current_random_round: number;
  allowed_options: TieOption[];
  split_allowed: boolean;
  selected_resolution: TieOption | null;
  winner_player_id: string | null;
  resolution_payload: Record<string, any>;
}

interface Participant {
  id: string;
  session_id: string;
  player_id: string;
  is_active_random: boolean;
}

interface Vote {
  player_id: string;
  option: TieOption;
  vote_round: number;
}

interface RandomEntry {
  player_id: string;
  generated_number: number;
  random_round: number;
}

interface State {
  session: TieBreakSession | null;
  participants: Participant[];
  votesCurrentRound: Vote[];
  randomCurrentRound: RandomEntry[];
  randomAllEntries: RandomEntry[];
  loading: boolean;
}

interface TieBreakModalProps {
  matchId: string;
  playerNames: Record<string, string>; // player_id → name
  winners?: any[];
  isLive?: boolean; // Transmissão ao vivo ativa
  isAutomatic?: boolean; // Sorteio automático ativo
}

// ─────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────
const OPTION_LABELS: Record<TieOption, string> = {
  random_number: 'Número Aleatório',
  rematch: 'Nova Partida',
  split_prize: 'Dividir Prêmio',
};

const OPTION_ICONS: Record<TieOption, React.ReactNode> = {
  random_number: <Dices className="w-5 h-5" />,
  rematch: <RefreshCw className="w-5 h-5" />,
  split_prize: <DollarSign className="w-5 h-5" />,
};

const OPTION_DESCRIPTIONS: Record<TieOption, string> = {
  random_number: 'Cada jogador gera um número aleatório. O maior número vence.',
  rematch: 'Uma nova partida será iniciada somente com os jogadores empatados.',
  split_prize: 'O prêmio é dividido igualmente entre todos os empatados.',
};

const ALL_OPTIONS: TieOption[] = ['random_number', 'rematch', 'split_prize'];

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
export const TieBreakModal = ({ matchId, playerNames, winners = [], isLive = false, isAutomatic = false }: TieBreakModalProps) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [state, setState] = useState<State>({
    session: null,
    participants: [],
    votesCurrentRound: [],
    randomCurrentRound: [],
    randomAllEntries: [],
    loading: true,
  });
  const [myVote, setMyVote] = useState<TieOption | null>(null);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [submittingRandom, setSubmittingRandom] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevRoundRef = useRef<number>(0);
  const prevStatusRef = useRef<string>('');

  const session = state.session;
  const isParticipant = state.participants.some(p => p.player_id === profile?.id);
  const isActiveForRandom = state.participants.find(p => p.player_id === profile?.id)?.is_active_random ?? false;
  const myRandomEntry = state.randomCurrentRound.find(r => r.player_id === profile?.id);
  const open = session !== null && session.status !== 'cancelled';

  // ──────────────────────────────────────
  // Carregar estado inicial
  // ──────────────────────────────────────
  const fetchState = async () => {
    const { data, error } = await supabase.rpc('get_tie_break_session_state', {
      p_match_id: matchId,
    });
    if (error || !data?.success) return;
    if (!data.found) {
      setState(s => ({ ...s, session: null, loading: false }));
      return;
    }
    setState({
      session: data.session,
      participants: data.participants || [],
      votesCurrentRound: data.votesCurrentRound || [],
      randomCurrentRound: data.randomCurrentRound || [],
      randomAllEntries: data.randomAllEntries || [],
      loading: false,
    });
    // Nova rodada de voto → reseta voto e reabre modal
    if (data.session?.current_vote_round !== prevRoundRef.current) {
      setMyVote(null);
      setDismissed(false);
      prevRoundRef.current = data.session?.current_vote_round ?? 0;
    }
    // Mudança de fase (ex: voting → random_pending) → reabre modal para todos
    if (data.session?.status !== prevStatusRef.current) {
      setDismissed(false);
      prevStatusRef.current = data.session?.status ?? '';
    }
  };

  useEffect(() => {
    fetchState();
  }, [matchId]);

  // ──────────────────────────────────────
  // Realtime: observa partida (tie_break_status) e sessão
  // ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`tie-break-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'partidas', filter: `id=eq.${matchId}` },
        () => { fetchState(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tie_break_sessions' },
        () => { fetchState(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tie_break_votes' },
        () => { fetchState(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tie_break_random_numbers' },
        () => { fetchState(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tie_break_participants' },
        () => { fetchState(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  // Fallback de sincronização: garante atualização para todos mesmo se algum evento realtime falhar
  useEffect(() => {
    if (!open) return;

    const intervalId = window.setInterval(() => {
      fetchState();
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open, matchId, session?.status]);

  // ──────────────────────────────────────
  // Votar
  // ──────────────────────────────────────
  const handleVote = async (option: TieOption) => {
    if (!session || submittingVote) return;
    setSubmittingVote(true);
    setMyVote(option);
    const { data, error } = await supabase.rpc('submit_tie_break_vote', {
      p_session_id: session.id,
      p_option: option,
    });
    setSubmittingVote(false);
    if (error || !data?.success) {
      toast.error('Erro ao registrar voto.', { description: error?.message || data?.error });
      setMyVote(null);
      return;
    }
    if (data.consensusReached) {
      toast.success(`Consenso! Opção escolhida: ${OPTION_LABELS[data.selectedResolution as TieOption]}.`);
    } else if (data.needsRevote) {
      toast.warning('Não houve consenso. Todos devem votar novamente.');
      setMyVote(null);
    } else {
      toast.info(`Voto registrado. Aguardar: ${data.votedCount}/${data.totalParticipants}`);
    }
    fetchState();
  };

  // ──────────────────────────────────────
  // Gerar número aleatório
  // ──────────────────────────────────────
  const handleGenerateRandom = async () => {
    if (!session || submittingRandom || myRandomEntry) return;
    setSubmittingRandom(true);
    const { data, error } = await supabase.rpc('submit_tie_break_random_number', {
      p_session_id: session.id,
    });
    setSubmittingRandom(false);
    if (error || !data?.success) {
      toast.error('Erro ao gerar número.', { description: error?.message || data?.error });
      return;
    }
    if (data.resolved) {
      toast.success(`Vencedor definido! Número mais alto: ${data.winningNumber}`);
    } else if (data.needsAnotherRandomRound) {
      toast.info('Empate no sorteio! Refazendo apenas entre empatados...');
    } else {
      toast.info(`Seu número: ${data.generatedNumber}. Aguardando demais jogadores...`);
    }
    fetchState();
  };

  const openDialog = open && !dismissed;

  if (state.loading || !openDialog) return null;

  const allOptions = ALL_OPTIONS;
  const allowedOptions = session?.allowed_options ?? [];
  const votedCount = state.votesCurrentRound.length;
  const totalParticipants = state.participants.length;
  const alreadyVotedThisRound = state.votesCurrentRound.some(v => v.player_id === profile?.id);
  const noConsensusMsg = (session?.current_vote_round ?? 0) > 1 && session?.status === 'voting';
  
  // Se tiver live ativa OU não for automático, o admin deve fechar manualmente
  const shouldNotAutoClose = isLive || !isAutomatic;
  
  const canClose =
    (!shouldNotAutoClose && session?.status === 'resolved') || // Só autofecha se automático E sem live E resolvido
    !isParticipant ||
    alreadyVotedThisRound ||
    (session?.status === 'random_pending' && !!myRandomEntry);
  const allNumbersSubmitted = state.randomCurrentRound.filter(r =>
    state.participants.find(p => p.player_id === r.player_id && p.is_active_random)
  ).length >= state.participants.filter(p => p.is_active_random).length;
  const activeRandomParticipants = state.participants.filter(p => p.is_active_random);
  const winningNumber = Number(session?.resolution_payload?.winningNumber || 0);
  const winnerPlayerId = session?.winner_player_id || session?.resolution_payload?.winnerPlayerId || null;
  const winnerEntry = winnerPlayerId
    ? winners.find((w: any) => w.playerId === winnerPlayerId && w.creditType === 'real')
    : null;
  const rematchMatchId = session?.resolution_payload?.rematchMatchId as string | undefined;
  const isAdmin = profile?.role === 'admin';
  const isSplitPrize = session?.selected_resolution === 'split_prize' || session?.resolution_payload?.majorityOption === 'split_prize';
  const splitPerPlayer = Number(session?.resolution_payload?.splitPerPlayer || 0);
  const tiedParticipantIds = new Set(state.participants.map((p) => p.player_id));
  const tiedWinnerEntries = winners.filter((w: any) => w.creditType === 'real' && tiedParticipantIds.has(w.playerId));

  return (
    <Dialog open={openDialog} onOpenChange={(v) => { if (!v && canClose) setDismissed(true); }}>
      <DialogContent
        className="max-w-md w-[calc(100vw-1rem)] sm:w-full max-h-[85vh] overflow-y-auto overflow-x-hidden"
        onPointerDownOutside={e => { if (!canClose) e.preventDefault(); }}
        onEscapeKeyDown={e => { if (!canClose) e.preventDefault(); }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-6 h-6 text-amber-500" />
            <DialogTitle className="font-heading text-xl">Empate Detectado!</DialogTitle>
          </div>
          <DialogDescription>
            Os jogadores abaixo empataram e precisam decidir como resolver o desempate.
          </DialogDescription>
        </DialogHeader>

        {/* Jogadores empatados */}
        <div className="flex flex-wrap gap-2 mb-4 max-w-full">
          {state.participants.map(p => (
            <Badge key={p.player_id} variant="secondary" className="flex items-center gap-1 max-w-full">
              <Users className="w-3 h-3" />
              <span className="truncate max-w-[180px]">{playerNames[p.player_id] || 'Jogador'}</span>
              {session?.status === 'random_pending' && !p.is_active_random && (
                <span className="ml-1 text-[9px] text-muted-foreground">(eliminado)</span>
              )}
            </Badge>
          ))}
        </div>

        {/* Aviso de sem consenso */}
        {noConsensusMsg && session?.status === 'voting' && (
          <Alert className="mb-4 border-amber-500 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 text-sm font-medium">
              Não houve consenso na rodada anterior. Todos devem escolher novamente.
            </AlertDescription>
          </Alert>
        )}

        {/* ── FASE: VOTAÇÃO ── */}
        {session?.status === 'voting' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-1">
              <span>Rodada de votação #{session.current_vote_round}</span>
              <span className={cn(
                "font-semibold",
                votedCount === totalParticipants ? "text-green-600" : "text-amber-600"
              )}>
                {votedCount}/{totalParticipants} votaram
              </span>
            </div>

            {isParticipant && (
              <>
                {allOptions.map(option => {
                  const allowed = allowedOptions.includes(option);
                  const isSelected = myVote === option || alreadyVotedThisRound && state.votesCurrentRound.find(v => v.player_id === profile?.id)?.option === option;
                  const votesForOption = state.votesCurrentRound.filter(v => v.option === option).length;

                  return (
                    <button
                      key={option}
                      disabled={!allowed || alreadyVotedThisRound || submittingVote}
                      onClick={() => allowed && !alreadyVotedThisRound && handleVote(option)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border-2 transition-all flex items-start gap-3",
                        !allowed
                          ? "opacity-40 cursor-not-allowed border-border bg-muted"
                          : isSelected
                            ? "border-primary bg-primary/10 shadow-md"
                            : "border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer",
                        alreadyVotedThisRound && !isSelected && "opacity-60"
                      )}
                    >
                      <span className={cn(
                        "mt-0.5 shrink-0",
                        isSelected ? "text-primary" : allowed ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {OPTION_ICONS[option]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-semibold text-sm",
                            isSelected ? "text-primary" : !allowed ? "text-muted-foreground" : "text-foreground"
                          )}>
                            {OPTION_LABELS[option]}
                          </span>
                          {!allowed && option === 'split_prize' && (
                            <Badge variant="outline" className="text-[9px] border-destructive/50 text-destructive">
                              Indisponível p/ produto
                            </Badge>
                          )}
                          {votesForOption > 0 && (
                            <Badge variant="secondary" className="text-[9px] ml-auto">
                              {votesForOption} voto{votesForOption > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                          {OPTION_DESCRIPTIONS[option]}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {!isParticipant && (
              <p className="text-xs text-center text-muted-foreground py-4">
                Você é espectador neste desempate. Aguarde a conclusão da votação.
              </p>
            )}

            {isParticipant && alreadyVotedThisRound && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Seu voto foi registrado. Aguardando os demais...</span>
              </div>
            )}

            {isAdmin && (
              <div className="space-y-3">
                {isLive && (
                  <Alert className="border-red-500 bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-700" />
                    <AlertDescription className="text-red-900 text-sm font-medium">
                      🔴 Transmissão ao vivo ativa! Mantenha este modal aberto enquanto anuncia aos espectadores.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Painel admin ao vivo (votos dos ganhadores)</p>
                  <div className="space-y-1.5">
                    {state.participants.map((p) => {
                      const vote = state.votesCurrentRound.find((v) => v.player_id === p.player_id);
                      return (
                        <div key={p.player_id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2 min-w-0">
                          <span className="text-xs font-medium truncate min-w-0">{playerNames[p.player_id] || 'Jogador'}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {vote ? OPTION_LABELS[vote.option] : 'Aguardando voto...'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FASE: NÚMERO ALEATÓRIO ── */}
        {session?.status === 'random_pending' && (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Cada jogador deve clicar para gerar seu número aleatório. O maior número vence.
              {session.current_random_round > 1 && (
                <span className="block mt-1 font-medium text-amber-600">
                  Rodada de desempate #{session.current_random_round} (apenas jogadores empatados)
                </span>
              )}
            </p>

            {/* Números da rodada (transparente em tempo real para todos) */}
            {activeRandomParticipants.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeRandomParticipants.map(p => {
                  const entry = state.randomCurrentRound.find(r => r.player_id === p.player_id);
                  return (
                    <div key={p.player_id} className={cn(
                      "flex items-center justify-between p-2.5 rounded-lg border-2",
                      entry && allNumbersSubmitted && entry.generated_number === Math.max(...state.randomCurrentRound.map(x => x.generated_number))
                        ? "border-amber-500 bg-amber-50"
                        : "border-border bg-muted/30"
                    )}>
                      <span className="text-xs font-medium truncate min-w-0">
                        {playerNames[p.player_id] || 'Jogador'}
                      </span>
                      {entry ? (
                        <span className="font-black text-lg tabular-nums">{entry.generated_number}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Aguardando...</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Botão para gerar */}
            {isParticipant && isActiveForRandom && (
              myRandomEntry ? (
                <div className="text-center py-3">
                  <p className="text-sm text-muted-foreground">Seu número:</p>
                  <p className={cn(
                    "text-5xl font-black font-mono tabular-nums mt-1",
                    allNumbersSubmitted ? "text-primary" : "text-foreground"
                  )}>
                    {myRandomEntry.generated_number}
                  </p>
                  {!allNumbersSubmitted && (
                    <div className="flex items-center justify-center gap-2 mt-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Aguardando os demais jogadores...</span>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  className="w-full gradient-primary font-bold text-base h-12"
                  onClick={handleGenerateRandom}
                  disabled={submittingRandom}
                >
                  {submittingRandom
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
                    : <><Dices className="w-5 h-5 mr-2" /> Gerar meu número</>
                  }
                </Button>
              )
            )}

            {isParticipant && !isActiveForRandom && (
              <div className="text-center text-sm text-muted-foreground py-4">
                Você foi eliminado nesta rodada de números. Aguarde o resultado.
              </div>
            )}

            {!isParticipant && (
              <div className="text-center text-sm text-muted-foreground py-4">
                Você é espectador neste desempate.
              </div>
            )}
          </div>
        )}

        {/* ── RESULTADO FINAL ── */}
        {session?.status === 'resolved' && (
          <div className="space-y-3">
            <Alert className="border-green-500 bg-green-50">
              <Trophy className="h-4 w-4 text-green-700" />
              <AlertDescription className="text-green-900 text-sm font-medium">
                Desempate concluido.
              </AlertDescription>
            </Alert>

            {isSplitPrize && splitPerPlayer > 0 && (
              <Alert className="border-amber-500 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertDescription className="text-amber-900 text-sm font-medium">
                  Premio dividido: cada ganhador levou {splitPerPlayer.toFixed(2)} em creditos.
                </AlertDescription>
              </Alert>
            )}

            {isSplitPrize ? (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Resultado</p>
                  <p className="font-semibold text-base">Premiacao dividida</p>
                  {splitPerPlayer > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Cada ganhador recebeu <span className="font-bold text-foreground">{splitPerPlayer.toFixed(2)}</span> creditos.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Cartelas empatadas</p>
                  <div className="space-y-1">
                    {tiedWinnerEntries.length > 0 ? (
                      tiedWinnerEntries.map((w: any) => (
                        <div key={`${w.playerId}-${w.cardId}`} className="flex items-center justify-between rounded-md border bg-background px-2.5 py-2 gap-2 min-w-0">
                          <span className="text-xs font-medium truncate min-w-0">{w.playerName || playerNames[w.playerId] || 'Jogador'}</span>
                          <span className="text-xs text-muted-foreground truncate">{w.cardName || w.cardId || 'Cartela'}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem cartelas empatadas registradas.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Vencedor</p>
                  <p className="font-semibold text-base">
                    {winnerPlayerId ? (playerNames[winnerPlayerId] || 'Jogador') : 'Nao identificado'}
                  </p>
                  {winningNumber > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Numero vencedor: <span className="font-bold text-foreground">{winningNumber}</span>
                    </p>
                  )}
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Cartela campea</p>
                  <p className="font-semibold text-sm">
                    {winnerEntry?.cardName || winnerEntry?.cardId || 'Cartela nao encontrada'}
                  </p>
                </div>
              </>
            )}

            {state.randomAllEntries.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Numeros gerados no desempate</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[...state.randomAllEntries]
                    .sort((a, b) => b.generated_number - a.generated_number)
                    .map((r) => (
                      <div
                        key={`${r.player_id}-${r.random_round}-${r.generated_number}`}
                        className={cn(
                          'flex items-center justify-between p-2 rounded-md border',
                          r.player_id === winnerPlayerId ? 'border-green-500 bg-green-50' : 'border-border bg-background'
                        )}
                      >
                        <span className="text-xs font-medium truncate min-w-0">
                          {playerNames[r.player_id] || 'Jogador'}
                          <span className="ml-1 text-[10px] text-muted-foreground">(R{r.random_round})</span>
                        </span>
                        <span className="font-bold tabular-nums">{r.generated_number}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {rematchMatchId && (
              <Button
                className="w-full gradient-primary"
                onClick={() => {
                  setDismissed(true);
                  navigate(`/match/${rematchMatchId}`);
                }}
              >
                Ir para nova partida
              </Button>
            )}

            {shouldNotAutoClose && isAdmin && (
              <Alert className="border-red-500 bg-red-50 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-700" />
                <AlertDescription className="text-red-900 text-sm font-medium">
                  {isLive 
                    ? '🔴 Transmissão ao vivo ativa! Você precisa fechar este modal manualmente após anunciar os vencedores.'
                    : '📢 Desempate resolvido! Você precisa fechar este modal manualmente após anunciar os vencedores.'}
                </AlertDescription>
              </Alert>
            )}

            <Button className="w-full" onClick={() => setDismissed(true)}>
              Fechar
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
};
