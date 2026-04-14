import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGame } from '@/contexts/GameContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRifas } from '@/hooks/useRifas';
import { useRifaAdmin } from '@/hooks/useRifaAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Match, MatchStatus, PlayerCard } from '@/types/match';
import { gameTypeLabels } from '@/utils/bingoUtils';
import {
  Coins, Plus, Trophy, Users, Settings,
  Timer, DoorOpen, Ticket, Zap, ZapOff, Tv, Archive, Trash2, RotateCcw, Star, Loader2, CalendarDays, Clock, Crown, ChevronDown, ChevronUp, Gift, BellRing, Search, SmartphoneNfc, UserPlus, ShieldCheck, AlertTriangle,
  VideoOff,
  Video,
  LifeBuoy
} from 'lucide-react';
import PlayerAvatar from '@/components/PlayerAvatar';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { CardCreator } from '@/components/CardCreator';
import { BingoCell } from '@/components/BingoCell';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { format, addMinutes, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const Lobby = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, profile } = useAuth();
  const {
    matches, joinMatch, getPlayerMatchCards, playerCards,
    buyCardUses, createPlayerCard, deletePlayerCard,
    toggleArchivePlayerCard, matchCards, wins, leaveMatch, gameSettings,
    allCreditRequests, allRedeemRequests, creditRequests, redeemRequests,
    publicSellers
  } = useGame();
  
  const { rifas } = useRifas();
  const { acertosPendentes, solicitacoesVendedor, todasFolhasBingo, todasCompras } = useRifaAdmin();

  const [now, setNow] = useState(Date.now());
  const [isCreateCardOpen, setCreateCardOpen] = useState(false);
  const [newCardName, setNewCardName] = useState('');
  const [newCardNumbers, setNewCardNumbers] = useState<number[][] | null>(null);
  const [creditType, setCreditType] = useState<'real' | 'fake'>('real');

  const [isJoinDialogOpen, setJoinDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [cardsToJoin, setCardsToJoin] = useState<Set<string>>(new Set());
  const [isJoining, setIsJoining] = useState(false);
  const [rechargingCardId, setRechargingCardId] = useState<string | null>(null);
  const [isAgendaOpen, setIsAgendaOpen] = useState(true);
  
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());
  const [expandedPrizes, setExpandedPrizes] = useState<Set<string>>(new Set());

  // Lógica de Notificações do Admin
  const isAdmin = profile?.role === 'admin';
  const pendingCreditsCount = allCreditRequests?.filter(r => r.status === 'pending').length || 0;
  const pendingRedeemsCount = allRedeemRequests?.filter(r => r.status === 'pending').length || 0;
  const pendingAcertosCount = acertosPendentes?.filter(a => a.status === 'pendente' || a.status === 'em_analise').length || 0;
  const pendingVendedorCount = solicitacoesVendedor?.filter(s => s.status === 'pendente').length || 0;
  
  // NOVA VALIDAÇÃO: Puxar e contar os PIX dos Clientes (Físico -> App)
  const pendingPixClientesCount = 
    (todasFolhasBingo?.filter(f => f.status === 'em_analise').length || 0) + 
    (todasCompras?.filter(c => c.status === 'em_analise').length || 0);

  const totalPendingAdminActions = pendingCreditsCount + pendingRedeemsCount + pendingAcertosCount + pendingVendedorCount + pendingPixClientesCount;

  // Lógica de Notificações do Usuário (Pendências próprias)
  const myPendingCreditsCount = creditRequests?.filter(r => r.status === 'pending').length || 0;
  const myPendingRedeemsCount = redeemRequests?.filter(r => r.status === 'pending').length || 0;
  
  // NOVA VALIDAÇÃO: Contabilizar itens que precisam da atenção do usuário (Rejeitados/Com mensagens)
  const myRejectedCreditsCount = creditRequests?.filter(r => r.status === 'rejected').length || 0;
  const myRejectedRedeemsCount = redeemRequests?.filter(r => r.status === 'rejected').length || 0;

  const hasMyPendingActions = myPendingCreditsCount > 0 || myPendingRedeemsCount > 0;
  const hasMyAttentionRequired = myRejectedCreditsCount > 0 || myRejectedRedeemsCount > 0;

  // Captura o link de indicação da URL se existir (mesmo sem estar logado)
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      localStorage.setItem('bingo_ref', ref);
      window.history.replaceState({}, document.title, window.location.pathname);
      toast.success("Código de indicação ativado para as suas compras!", { duration: 4000 });
    }
  }, [searchParams]);

  const toggleParticipants = (matchId: string) => {
    setExpandedParticipants(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  };

  const togglePrizes = (matchId: string) => {
    setExpandedPrizes(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  };

  const participantIds = useMemo(() => {
    return Array.from(new Set(matchCards.map(mc => mc.player_id)));
  }, [matchCards]);

  const { data: participantProfiles = [] } = useQuery({
    queryKey: ['participantProfiles', participantIds],
    queryFn: async () => {
      if (participantIds.length === 0) return [];
      const { data, error } = await supabase.rpc('get_public_profiles', { p_user_ids: participantIds });
      if (error) {
        console.error("Erro ao carregar perfis públicos:", error);
        return [];
      }
      return data || [];
    },
    enabled: participantIds.length > 0,
  });

  const myOwnedCards = profile ? playerCards.filter(c => c.player_id === profile.id) : [];
  const activeCards = myOwnedCards.filter(c => !c.is_archived);
  const archivedCards = myOwnedCards.filter(c => c.is_archived);

  const rifasGanhas = useMemo(() => {
    if (!profile) return [];
    return rifas.filter(r => r.status === 'finalizada' && r.ganhador_id === profile.id && !r.ganhador_confirmou);
  }, [rifas, profile]);
  const hasWonRifa = rifasGanhas.length > 0;
  const activeRifasCount = rifas.filter(r => r.status === 'ativa').length;
  const prevMatchStatusRef = useRef<Record<string, MatchStatus>>({});
  const hasLoadedStatusesRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const currentStatusMap: Record<string, MatchStatus> = {};
    for (const m of matches) {
      currentStatusMap[m.id] = m.status;
    }

    // Evita alertas falsos no primeiro carregamento da tela.
    if (!hasLoadedStatusesRef.current) {
      prevMatchStatusRef.current = currentStatusMap;
      hasLoadedStatusesRef.current = true;
      return;
    }

    if (profile?.role !== 'admin') {
      for (const m of matches) {
        const previous = prevMatchStatusRef.current[m.id];
        const changedToLive = previous && previous !== 'in_progress' && m.status === 'in_progress';
        if (changedToLive) {
          toast.info('Partida ao vivo agora', {
            description: `${m.name} acabou de entrar em Ao Vivo.`,
            duration: 5000,
          });
        }
      }
    }

    prevMatchStatusRef.current = currentStatusMap;
  }, [matches, profile?.role]);

  const schedule = useMemo(() => {
    if (!gameSettings?.auto_engine_enabled) return [];
    const interval = gameSettings.auto_engine_interval_mins || 60;
    const startHour = gameSettings.auto_engine_start_hour || 0;
    const times = [];
    let checkTime = startOfDay(new Date()).getTime() + (startHour * 3600000);
    const limit = addMinutes(new Date(), 24 * 60).getTime();
    while (checkTime < limit) {
      if (checkTime > now) times.push(new Date(checkTime));
      checkTime += interval * 60 * 1000;
      if (times.length >= 24) break;
    }
    return times;
  }, [gameSettings, now]);

  const handleCreateCard = async () => {
    if (!newCardName.trim() || !newCardNumbers) return;
    const card = await createPlayerCard({ name: newCardName, numbers: newCardNumbers, creditType });
    if (card) {
      toast.success('Cartela criada!');
      setCreateCardOpen(false);
      setNewCardName('');
      setNewCardNumbers(null);
    }
  };

  const openJoinDialog = (match: Match) => {
    if (!profile) {
      navigate('/login');
      return;
    }
    setSelectedMatch(match);
    setCardsToJoin(new Set());
    setJoinDialogOpen(true);
  };

  const handleJoinMatch = async () => {
    if (!selectedMatch || cardsToJoin.size === 0) return;
    setIsJoining(true);
    try {
      const cardIds = Array.from(cardsToJoin);
      const refCode = localStorage.getItem('bingo_ref') || undefined; 
      const newMatchCards = await joinMatch(selectedMatch.id, cardIds, refCode);
      if (newMatchCards && newMatchCards.length > 0) {
        toast.success('🎉 Você entrou na partida!');
        setJoinDialogOpen(false);
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleBuyUses = async (cardId: string) => {
    const success = await buyCardUses(cardId);
    if (success) toast.success('Cartela Recarregada!');
  };

  const handleRechargeInDialog = async (cardId: string) => {
    setRechargingCardId(cardId);
    const success = await buyCardUses(cardId);
    if (success) toast.success('Cartela Recarregada!');
    setRechargingCardId(null);
  };

  const getMatchCountdown = (startTime: string) => {
    const diff = new Date(startTime).getTime() - now;
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h > 0 ? `${h.toString().padStart(2, '0')}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const sortedMatches = [...matches].sort((a, b) => {
    const statusOrder: Record<MatchStatus, number> = { 'in_progress': 1, 'open': 2, 'waiting': 3, 'finished': 4 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  const activeMatchIds = new Set(matches.filter(m => m.status === 'in_progress').map(m => m.id));
  const inProgressMatches = sortedMatches.filter(m => m.status === 'in_progress');
  const openMatches = sortedMatches.filter(m => m.status === 'open');
  const waitingMatches = sortedMatches.filter(m => m.status === 'waiting');
  const finishedMatches = sortedMatches.filter(m => 
    m.status === 'finished' && 
    (m.winners || []).some((w: any) => w.creditType === 'real')
  );

  const totalPot = matches.filter(m => m.status !== 'finished').reduce((acc, m) => acc + Number(m.pot || 0), 0);
  const totalPlayers = new Set(matchCards.filter(mc => {
    const m = matches.find(match => match.id === mc.match_id);
    return m && m.status !== 'finished';
  }).map(mc => mc.player_id)).size;

  const renderCardList = (cards: PlayerCard[]) => {
    if (cards.length === 0) return <div className="card-container text-center py-8"><p className="text-sm text-muted-foreground">Nenhuma cartela encontrada.</p></div>;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(card => {
          const activeMatchCard = matchCards.find(mc => mc.player_card_id === card.id && activeMatchIds.has(mc.match_id));
          const markedNumbers = activeMatchCard ? activeMatchCard.marked_numbers : new Set<number>();
          const winCount = wins.filter(w => w.player_card_id === card.id).length;
          const isFake = (card as any).credit_type === 'fake';
          return (
            <div key={card.id} className={cn("card-container p-3", card.uses_left === 0 && 'opacity-80')}>
              <div className="flex justify-between items-start mb-2 gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-heading font-semibold text-sm truncate">{card.name}</h3>
                    {isFake && <Badge variant="outline" className="text-[8px] h-3.5 border-amber-400 text-amber-600">Brincar</Badge>}
                    {winCount > 0 && <Badge className="bg-amber-400/20 text-amber-600 text-[8px] h-3.5 border-none"><Trophy className="w-2 h-2 mr-0.5" />{winCount}x</Badge>}
                  </div>
                  <p className="text-[9px] text-muted-foreground font-mono">...{card.id.slice(-6).toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant={card.uses_left > 0 ? "default" : "destructive"} className={cn("text-[9px] h-5 px-1.5", card.uses_left > 0 && "bg-success hover:bg-success/90 text-white")}>
                    {card.uses_left} uso(s)
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleArchivePlayerCard(card.id, !card.is_archived)}>
                    {card.is_archived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Cartela?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. A cartela "{card.name}" será removida permanentemente da sua conta.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deletePlayerCard(card.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Excluir Permanentemente
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {card.numbers.flat().map((num, i) => (
                  <BingoCell key={i} number={num} isMarked={markedNumbers.has(num)} isFreeSpace={i === 12} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMatchList = (matchesToRender: Match[]) => {
    if (matchesToRender.length === 0) return <div className="card-container text-center py-12"><p className="text-sm text-muted-foreground">Nenhuma partida disponível.</p></div>;
    return (
      <div className="space-y-4">
        {matchesToRender.map(match => {
          const allCardsInMatch = matchCards.filter(mc => mc.match_id === match.id);
          const realCardsCount = allCardsInMatch.filter(c => c.credit_type === 'real').length;
          const fakeCardsCount = allCardsInMatch.filter(c => c.credit_type === 'fake').length;
          const playersInMatchCount = new Set(allCardsInMatch.map(mc => mc.player_id)).size;
          
          const myMatchCards = profile ? getPlayerMatchCards(match.id, profile.id) : [];
          const alreadyJoined = myMatchCards.length > 0;
          
          const countdownMatch = (match.status === 'waiting' || match.status === 'open') ? getMatchCountdown(match.start_time) : null;
          const prizeValue = match.prize.type === 'percentage' ? (Number(match.pot || 0) * (Number(match.prize.value) || 0)) / 100 : (Number(match.prize.value) || 0);

          const isFestival = match.is_festival && match.prizes && match.prizes.length > 0;

          return (
            <div key={match.id} className={cn("card-container p-0 overflow-hidden border-2 transition-all", match.status === 'in_progress' ? 'border-accent ring-2 ring-accent/10' : isFestival ? 'border-purple-500/30' : 'border-transparent')}>
              <div className="p-4">
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-bold text-lg">{match.name}</h3>
                      {isFestival && <Badge className="bg-purple-100 text-purple-800 border-purple-300">Festival</Badge>}
                      {match.status === 'in_progress' && <Badge variant="destructive" className="animate-pulse text-[10px]">AO VIVO</Badge>}
                      {countdownMatch && <Badge variant="outline" className="text-[10px] font-mono"><Timer className="w-3 h-3 mr-1" />{countdownMatch}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground font-medium">
                      <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />{gameTypeLabels[match.game_type]}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{playersInMatchCount} Jogadores</span>
                      <span className="flex items-center gap-1" title={`${realCardsCount} Reais / ${fakeCardsCount} Brincar`}>
                        <Ticket className="w-3 h-3" /> 
                        {allCardsInMatch.length} Cartelas 
                        <span className="flex items-center gap-1 ml-1 opacity-80">
                          (<Coins className="w-2.5 h-2.5 text-primary" />{realCardsCount} / <Star className="w-2.5 h-2.5 text-amber-600" />{fakeCardsCount})
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 sm:flex-col items-end justify-between sm:justify-center">
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">
                        {isFestival ? `Prêmio ${(match.current_round || 0) + 1}/${match.prizes?.length}` : 'Prêmio'}
                      </p>
                      <p className="text-lg font-bold text-success leading-none">
                        {match.prize.type === 'product' ? match.prize.productName : `${Number(prizeValue).toFixed(2)} cr.`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Entrada</p>
                      <p className="text-sm font-bold leading-none">{Number(match.card_price).toFixed(2)} cr.</p>
                    </div>
                  </div>
                </div>
                
                {isFestival && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <button
                      onClick={() => togglePrizes(match.id)}
                      className="flex items-center gap-2 w-full py-1.5 text-[11px] font-bold uppercase text-purple-600 hover:text-purple-700 transition-colors"
                    >
                      <Gift className="w-3.5 h-3.5 shrink-0" />
                      <span>Ver sequência de Prêmios ({match.prizes?.length} rodadas)</span>
                      {expandedPrizes.has(match.id) ? <ChevronUp className="w-3.5 h-3.5 ml-auto shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto shrink-0" />}
                    </button>
                    {expandedPrizes.has(match.id) && (
                      <div className="flex flex-col gap-2 mt-3 p-3 bg-purple-50/50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800/30 animate-in fade-in slide-in-from-top-2">
                        {match.prizes?.map((pz, idx) => {
                          const isCurrent = match.current_round === idx;
                          const isPast = (match.current_round || 0) > idx;
                          const val = pz.type === 'percentage' ? `${pz.value}% do Pote` : pz.type === 'fixed' ? `${pz.value} cr.` : pz.productName;
                          return (
                            <div key={idx} className={cn("flex items-center justify-between p-2 rounded-lg border", isCurrent ? "bg-purple-100 border-purple-300 dark:bg-purple-900/40" : isPast ? "bg-muted border-transparent opacity-60" : "bg-background border-border")}>
                               <div className="flex items-center gap-2">
                                 <span className="font-bold text-xs text-muted-foreground">{idx + 1}º</span>
                                 <span className={cn("font-semibold text-sm", isCurrent ? "text-purple-800 dark:text-purple-300" : "text-foreground")}>{val}</span>
                               </div>
                               {isCurrent && <Badge className="bg-purple-500 text-[9px] text-white border-none">Atual</Badge>}
                               {isPast && <Badge variant="outline" className="text-[9px]">Sorteado</Badge>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {match.status !== 'finished' && allCardsInMatch.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <button
                      onClick={() => toggleParticipants(match.id)}
                      className="flex items-center gap-2 w-full py-1.5 text-[11px] font-bold uppercase text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>Ver participantes ({playersInMatchCount})</span>
                      {expandedParticipants.has(match.id) ? <ChevronUp className="w-3.5 h-3.5 ml-auto shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto shrink-0" />}
                    </button>
                    {expandedParticipants.has(match.id) && (
                      <div className="flex flex-wrap gap-2 mt-3 p-3 bg-muted/40 rounded-xl border border-border/50 animate-in fade-in slide-in-from-top-2">
                        {Array.from(new Set(allCardsInMatch.map(mc => mc.player_id))).map(pid => {
                          const p = participantProfiles.find((pr: any) => pr.id === pid);
                          const pCards = allCardsInMatch.filter(mc => mc.player_id === pid);
                          const realCount = pCards.filter(c => c.credit_type === 'real').length;
                          const fakeCount = pCards.filter(c => c.credit_type === 'fake').length;
                          return (
                            <div key={pid} className="flex items-center gap-2.5 bg-card border border-border shadow-sm rounded-full pl-1.5 pr-4 py-1.5 min-w-0 hover:border-primary/40 transition-all">
                              <PlayerAvatar url={p?.avatar_url || null} fallback={p?.full_name} className="w-8 h-8 shadow-sm" />
                              <div className="flex flex-col justify-center">
                                <span className="text-xs font-bold leading-tight truncate max-w-[100px] text-foreground">{p?.full_name || 'Jogador'}</span>
                                <span className="text-[9px] font-medium text-muted-foreground leading-tight flex items-center gap-1.5 mt-0.5">
                                  {realCount > 0 && <span className="flex items-center gap-0.5 text-primary"><Coins className="w-2.5 h-2.5" />{realCount}</span>}
                                  {fakeCount > 0 && <span className="flex items-center gap-0.5 text-amber-600"><Star className="w-2.5 h-2.5" />{fakeCount}</span>}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {match.status === 'finished' && (match.winners || []).filter((w: any) => w.creditType === 'real').length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-500" /> Ganhadores</p>
                    <div className="flex flex-wrap gap-2">
                      {(match.winners || []).filter((w: any) => w.creditType === 'real').map((w: any) => {
                        const p = participantProfiles.find((pr: any) => pr.id === w.playerId);
                        return (
                          <div key={w.cardId} className="flex items-center gap-2 bg-success/10 border border-success/20 rounded-full pl-1.5 pr-3 py-1">
                            <PlayerAvatar url={p?.avatar_url || null} fallback={w.playerName} className="w-7 h-7 border border-success/30" />
                            <span className="text-[11px] font-bold text-success truncate max-w-[100px]">{w.playerName}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                
                <div className="mt-4 pt-4 border-t flex flex-wrap gap-2 justify-end">
                  {match.status === 'in_progress' && (
                    <Button size="sm" className="bg-accent hover:bg-accent/90 text-white font-bold" onClick={() => profile ? navigate(`/match/${match.id}`) : navigate('/login')}>
                      <Tv className="w-4 h-4 mr-2" /> ASSISTIR
                    </Button>
                  )}
                  {match.status === 'open' && (
                    <>
                      {isAdmin ? (
                        <Button size="sm" className="gradient-accent text-white font-bold" onClick={() => navigate(`/admin`)}>
                          <Settings className="w-4 h-4 mr-2" /> GERENCIAR
                        </Button>
                      ) : (
                        <>
                          {alreadyJoined && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => leaveMatch(match.id)}>Sair</Button>
                          )}
                          <Button
                            size="sm"
                            className="gradient-accent text-white font-bold"
                            onClick={() => openJoinDialog(match)}
                            disabled={myMatchCards.length >= match.max_cards_per_player}
                          >
                            {!profile ? 'LOGIN PARA ENTRAR' : (myMatchCards.length >= match.max_cards_per_player) ? 'LIMITE ATINGIDO' : alreadyJoined ? 'ADICIONAR MAIS' : 'ENTRAR'}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Banner Admin */}
      {isAdmin && totalPendingAdminActions > 0 && (
         <div className="bg-amber-500/10 border-2 border-amber-500/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm relative overflow-hidden mb-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -z-10" />
            <div className="flex items-start gap-3 z-10">
              <div className="bg-amber-500 p-2 rounded-full text-white animate-pulse shrink-0 shadow-md">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-amber-800 dark:text-amber-500 leading-tight">Ações Pendentes (Admin)</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs font-semibold text-amber-700/80 dark:text-amber-400/80">
                   {pendingCreditsCount > 0 && <span className="flex items-center gap-1">• {pendingCreditsCount} recarga(s) via PIX</span>}
                   {pendingAcertosCount > 0 && <span className="flex items-center gap-1">• {pendingAcertosCount} acerto(s) de vendedor</span>}
                   {pendingRedeemsCount > 0 && <span className="flex items-center gap-1">• {pendingRedeemsCount} resgate(s)</span>}
                   {pendingVendedorCount > 0 && <span className="flex items-center gap-1">• {pendingVendedorCount} inscrição(ões) de vendedor</span>}
                   {pendingPixClientesCount > 0 && <span className="flex items-center gap-1 text-blue-700 dark:text-blue-400 font-bold">• <SmartphoneNfc className="w-3 h-3"/> {pendingPixClientesCount} PIX de Cliente(s) para validar</span>}
                </div>
              </div>
            </div>
            <Button className="shrink-0 w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white shadow-sm z-10" onClick={() => navigate('/admin')}>
              Abrir Painel Admin
            </Button>
         </div>
      )}

      {/* NOVO: Banner Usuário Comum (MENSAGENS DO ADMIN / REJEIÇÕES) */}
      {!isAdmin && hasMyAttentionRequired && (
         <div className="bg-destructive/10 border-2 border-destructive/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm relative overflow-hidden mb-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/10 rounded-full blur-3xl -z-10" />
            <div className="flex items-start gap-3 z-10">
              <div className="bg-destructive p-2 rounded-full text-white animate-pulse shrink-0 shadow-md">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-destructive leading-tight">Atenção Necessária</h3>
                <div className="flex flex-col mt-1 text-xs font-semibold text-destructive/80">
                   {myRejectedCreditsCount > 0 && <span>• Você tem {myRejectedCreditsCount} compra(s) de crédito aguardando resposta.</span>}
                   {myRejectedRedeemsCount > 0 && <span>• O Admin enviou uma mensagem sobre seu resgate ({myRejectedRedeemsCount}).</span>}
                   <span className="mt-1 font-bold text-destructive">Abra o menu no canto superior direito e clique em "Histórico" para responder.</span>
                </div>
              </div>
            </div>
         </div>
      )}

      {/* Banner Usuário Comum (Pendências) */}
      {!isAdmin && hasMyPendingActions && !hasMyAttentionRequired && (
         <div className="bg-amber-500/10 border-2 border-amber-500/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm relative overflow-hidden mb-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -z-10" />
            <div className="flex items-start gap-3 z-10">
              <div className="bg-amber-500 p-2 rounded-full text-white animate-pulse shrink-0 shadow-md">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-amber-800 dark:text-amber-500 leading-tight">Solicitação em Análise</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs font-semibold text-amber-700/80 dark:text-amber-400/80">
                   {myPendingCreditsCount > 0 && <span className="flex items-center gap-1">• {myPendingCreditsCount} solicitação(ões) de crédito pendentes</span>}
                   {myPendingRedeemsCount > 0 && <span className="flex items-center gap-1">• {myPendingRedeemsCount} resgate(s) em andamento</span>}
                </div>
              </div>
            </div>
         </div>
      )}

      {profile?.role === 'admin' && (
        <Button className="w-full h-9 text-xs" variant="outline" onClick={() => navigate('/admin')}>
          <Settings className="w-3.5 h-3.5 mr-2" /> Painel Administrativo
        </Button>
      )}

      {/* DASHBOARD PRINCIPAL */}
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2 sm:gap-4">
        <div className="card-container p-2 sm:p-4 bg-primary text-white border-none flex flex-col items-center text-center justify-center">
          <Coins className="w-4 h-4 sm:w-6 sm:h-6 mb-1 opacity-80" />
          <p className="text-[9px] sm:text-xs font-bold uppercase opacity-70 leading-tight">Pote</p>
          <p className="text-xs sm:text-xl font-bold font-heading truncate w-full">{Number(totalPot).toFixed(0)}</p>
        </div>
        
        <div className="card-container p-2 sm:p-4 bg-accent text-white border-none flex flex-col items-center text-center justify-center cursor-pointer hover:opacity-90 transition-opacity" onClick={() => navigate('/active-players')}>
          <Users className="w-4 h-4 sm:w-6 sm:h-6 mb-1 opacity-80" />
          <p className="text-[9px] sm:text-xs font-bold uppercase opacity-70 leading-tight">Ativos</p>
          <p className="text-xs sm:text-xl font-bold font-heading truncate w-full">{totalPlayers}</p>
        </div>
        
        <div className="card-container p-2 sm:p-4 bg-amber-500 text-white border-none flex flex-col items-center text-center justify-center cursor-pointer hover:opacity-90 transition-opacity" onClick={() => navigate('/trophies')}>
          <Trophy className="w-4 h-4 sm:w-6 sm:h-6 mb-1 opacity-80" />
          <p className="text-[9px] sm:text-xs font-bold uppercase opacity-70 leading-tight">Troféus</p>
          <p className="text-xs sm:text-xl font-bold font-heading truncate w-full">{wins.length}</p>
        </div>
        
        <div className="card-container p-2 sm:p-4 bg-yellow-500 text-white border-none flex flex-col items-center text-center justify-center cursor-pointer hover:opacity-90 transition-opacity" onClick={() => navigate('/ranking')}>
          <Crown className="w-4 h-4 sm:w-6 sm:h-6 mb-1 opacity-80" />
          <p className="text-[9px] sm:text-xs font-bold uppercase opacity-70 leading-tight">Ranking</p>
          <p className="text-xs sm:text-xl font-bold font-heading truncate w-full">Top</p>
        </div>
        
        <div 
          className={cn(
            "card-container p-2 sm:p-4 border-none flex flex-col items-center text-center justify-center cursor-pointer transition-all",
            hasWonRifa ? "bg-green-500 text-white animate-pulse shadow-lg shadow-green-500/40 border-2 border-white" : "bg-purple-500 hover:bg-purple-600 text-white"
          )}
          onClick={() => navigate('/rifas')}
        >
          <Gift className={cn("w-4 h-4 sm:w-6 sm:h-6 mb-1 opacity-80", hasWonRifa && "animate-bounce")} />
          <p className="text-[9px] sm:text-xs font-bold uppercase opacity-70 leading-tight">Rifas</p>
          <p className="text-xs sm:text-xl font-bold font-heading truncate w-full">
            {hasWonRifa ? 'GANHOU!' : activeRifasCount}
          </p>
        </div>

        <div 
          className="card-container p-2 sm:p-4 bg-slate-700 hover:bg-slate-800 text-white border-none flex flex-col items-center text-center justify-center cursor-pointer transition-opacity shadow-sm"
          onClick={() => navigate('/validar-cartela')}
        >
          <Search className="w-4 h-4 sm:w-6 sm:h-6 mb-1 opacity-80" />
          <p className="text-[9px] sm:text-xs font-bold uppercase opacity-70 leading-tight">Validar</p>
          <p className="text-xs sm:text-xl font-bold font-heading truncate w-full">Bilhete</p>
        </div>

 
      <div 
          className="card-container p-2 sm:p-4 bg-blue-700 hover:bg-slate-800 text-white border-none flex flex-col items-center text-center justify-center cursor-pointer transition-opacity shadow-sm"
          onClick={() => navigate('/convite-bingo')}
        >
          <Video className="w-4 h-4 sm:w-6 sm:h-6 mb-1 opacity-80" />
          <p className="text-[9px] sm:text-xs font-bold uppercase opacity-70 leading-tight">Videos</p>
          <p className="text-xs sm:text-xl font-bold font-heading truncate w-full">Aulas</p>
        </div>

        <div 
          className="card-container p-2 sm:p-4 bg-emerald-700 hover:bg-emerald-800 text-white border-none flex flex-col items-center text-center justify-center cursor-pointer transition-opacity shadow-sm"
          onClick={() => navigate('/suporte')}
        >
          <LifeBuoy className="w-4 h-4 sm:w-6 sm:h-6 mb-1 opacity-80" />
          <p className="text-[9px] sm:text-xs font-bold uppercase opacity-70 leading-tight">Suporte</p>
          <p className="text-xs sm:text-xl font-bold font-heading truncate w-full">Ajuda</p>
        </div>


      </div>
      

       <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 order-2 lg:order-1 space-y-6">
          {gameSettings?.auto_engine_enabled && (
            <div className="card-container p-0 border-2 border-primary/20 overflow-hidden">
              <button 
                onClick={() => setIsAgendaOpen(!isAgendaOpen)}
                className="w-full p-4 flex items-center justify-between bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <h3 className="font-heading font-bold text-sm flex items-center gap-2 text-primary">
                  <CalendarDays className="w-4 h-4" /> Agenda de Hoje
                </h3>
                {isAgendaOpen ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-primary" />}
              </button>
              
              <div className={cn(
                "transition-all duration-300 ease-in-out overflow-hidden",
                isAgendaOpen ? "max-h-[1000px] opacity-100 p-4" : "max-h-0 opacity-0"
              )}>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                  {schedule.map((time, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 text-[11px]">
                      <span className="font-bold text-primary">{format(time, 'HH:mm')}</span>
                      <span className="text-[9px] font-mono text-muted-foreground">
                        {getMatchCountdown(time.toISOString()) || 'Agora'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CARD DE VENDEDORES (Para o Dashboard Público) */}
          <div className="card-container p-0 border-2 border-blue-500/20 overflow-hidden bg-blue-50/30">
             <div className="p-4 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between">
               <h3 className="font-heading font-bold text-sm flex items-center gap-2 text-blue-800">
                 <UserPlus className="w-4 h-4" /> Vendedores Autorizados
               </h3>
             </div>
             <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
               {publicSellers && publicSellers.length > 0 ? (
                 publicSellers.map((seller: any) => (
                   <div key={seller.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-blue-100 shadow-sm cursor-pointer hover:border-blue-300 transition-colors" onClick={() => navigate(`/vendedor/perfil/${seller.codigo_ref}`)}>
                     <PlayerAvatar url={seller.perfis?.avatar_url || seller.cadastro?.foto_url} fallback={seller.nome} className="w-10 h-10 shadow-sm" />
                     <div className="min-w-0 flex-1">
                       <p className="font-bold text-sm text-blue-900 truncate">{seller.nome}</p>
                       <div className="flex items-center gap-1 mt-0.5">
                         <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-200 py-0 px-1.5"><ShieldCheck className="w-2.5 h-2.5 mr-1" /> Verificado</Badge>
                       </div>
                     </div>
                   </div>
                 ))
               ) : (
                 <p className="text-xs text-muted-foreground text-center py-4">Nenhum vendedor disponível no momento.</p>
               )}
             </div>
          </div>
        </div>

        <div className={cn("space-y-8 order-1 lg:order-2", "lg:col-span-9")}>
          <section>
            <div className="flex items-center gap-2 mb-4">
              <DoorOpen className="w-5 h-5 text-accent" />
              <h2 className="font-heading text-lg font-bold">Partidas</h2>
            </div>
            <Tabs defaultValue="in_progress" className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-9 bg-muted/50 p-1 mb-4">
                <TabsTrigger value="in_progress" className="text-[10px] sm:text-xs flex items-center gap-1">
                  Ao Vivo {inProgressMatches.length > 0 && <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-white">{inProgressMatches.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="open" className="text-[10px] sm:text-xs flex items-center gap-1">
                  Abertas {openMatches.length > 0 && <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-white">{openMatches.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="waiting" className="text-[10px] sm:text-xs flex items-center gap-1">
                  Espera {waitingMatches.length > 0 && <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">{waitingMatches.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="finished" className="text-[10px] sm:text-xs flex items-center gap-1">
                  Fim {finishedMatches.length > 0 && <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success text-[8px] font-bold text-white">{finishedMatches.length}</span>}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="in_progress" className="mt-0">{renderMatchList(inProgressMatches)}</TabsContent>
              <TabsContent value="open" className="mt-0">{renderMatchList(openMatches)}</TabsContent>
              <TabsContent value="waiting" className="mt-0">{renderMatchList(waitingMatches)}</TabsContent>
              <TabsContent value="finished" className="mt-0">{renderMatchList(finishedMatches)}</TabsContent>
            </Tabs>
          </section>

          {profile && !isAdmin && (
            <section>
              <div className="flex items-center justify-between mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-primary" />
                  <h2 className="font-heading text-lg font-bold">Minhas Cartelas</h2>
                </div>
                <Dialog open={isCreateCardOpen} onOpenChange={setCreateCardOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gradient-primary font-bold h-8 text-[11px] px-3">
                      <Plus className="w-3.5 h-3.5 mr-1" /> NOVA CARTELA
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Criar Cartela</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Tipo de Crédito</Label>
                        <RadioGroup value={creditType} onValueChange={(v: 'real' | 'fake') => setCreditType(v)} className="grid grid-cols-2 gap-2">
                          <Label 
                            htmlFor="real" 
                            className={cn(
                              "flex flex-col items-center p-4 border-2 rounded-xl cursor-pointer transition-all",
                              creditType === 'real' 
                                ? "border-primary bg-primary/10 text-primary" 
                                : "border-muted bg-muted/30 text-muted-foreground hover:border-muted-foreground/30"
                            )}
                          >
                            <RadioGroupItem value="real" id="real" className="sr-only" />
                            <Coins className={cn("w-6 h-6 mb-2", creditType === 'real' ? "text-primary" : "text-muted-foreground")} />
                            <span className="text-xs font-bold uppercase tracking-wider">Reais</span>
                          </Label>
                          <Label 
                            htmlFor="fake" 
                            className={cn(
                              "flex flex-col items-center p-4 border-2 rounded-xl cursor-pointer transition-all",
                              creditType === 'fake' 
                                ? "border-primary bg-primary/10 text-primary" 
                                : "border-muted bg-muted/30 text-muted-foreground hover:border-muted-foreground/30"
                            )}
                          >
                            <RadioGroupItem value="fake" id="fake" className="sr-only" />
                            <Star className={cn("w-6 h-6 mb-2", creditType === 'fake' ? "text-primary" : "text-muted-foreground")} />
                            <span className="text-xs font-bold uppercase tracking-wider">Brincar</span>
                          </Label>
                        </RadioGroup>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nome</Label>
                        <Input placeholder="Ex: Sorte" value={newCardName} onChange={e => setNewCardName(e.target.value)} />
                      </div>
                      <CardCreator onCardChange={setNewCardNumbers} />
                    </div>
                    <DialogFooter>
                      <Button size="sm" onClick={handleCreateCard} disabled={!newCardName.trim() || !newCardNumbers} className="w-full">
                        Salvar Cartela
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-8 bg-muted/30 mb-4">
                  <TabsTrigger value="active" className="text-[10px]">Ativas ({activeCards.length})</TabsTrigger>
                  <TabsTrigger value="archived" className="text-[10px]">Arquivadas ({archivedCards.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="mt-0">{renderCardList(activeCards)}</TabsContent>
                <TabsContent value="archived" className="mt-0">{renderCardList(archivedCards)}</TabsContent>
              </Tabs>
            </section>
          )}
        </div>
      </div>

      <Dialog open={isJoinDialogOpen} onOpenChange={setJoinDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Entrar na Partida</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {(() => {
              if (!profile) return null;
              const availableCardsToJoin = activeCards.filter(card => !new Set(getPlayerMatchCards(selectedMatch?.id || '', profile.id).map(c => c.player_card_id)).has(card.id));
              
              if (availableCardsToJoin.length === 0) {
                return (
                  <div className="text-center p-6 bg-muted/50 rounded-lg border border-dashed">
                     <p className="text-sm font-bold text-foreground">Nenhuma cartela disponível.</p>
                     <p className="text-xs mt-2 text-muted-foreground">Você já adicionou todas as suas cartelas nesta partida. Volte ao lobby e crie novas cartelas na aba "Minhas Cartelas" se desejar adicionar mais.</p>
                  </div>
                );
              }

              return availableCardsToJoin.map(card => {
                const isSelected = cardsToJoin.has(card.id);
                const isDisabled = card.uses_left === 0;
                return (
                  <div
                    key={card.id}
                    onClick={() => !isDisabled && setCardsToJoin(prev => {
                      const next = new Set(prev);
                      if (isSelected) {
                        next.delete(card.id);
                      } else {
                        const myCurrentCount = getPlayerMatchCards(selectedMatch?.id || '', profile.id).length;
                        const maxAllowed = (selectedMatch?.max_cards_per_player || 0) - myCurrentCount;
                        if (next.size < maxAllowed) {
                          next.add(card.id);
                        } else {
                          toast.error(`Limite da partida: você só pode adicionar mais ${maxAllowed} cartela(s).`);
                        }
                      }
                      return next;
                    })}
                    className={cn("p-3 rounded-lg border-2 transition-all flex justify-between items-center cursor-pointer", isSelected ? 'border-primary bg-primary/5' : 'border-transparent bg-secondary hover:bg-secondary/80', isDisabled && 'opacity-50 cursor-not-allowed')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{card.name}</span>
                      {card.credit_type === 'fake' ? (
                        <Badge variant="outline" className="text-[9px] h-4 py-0 px-1.5 border-amber-400 text-amber-600 bg-amber-50">Brincar</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] h-4 py-0 px-1.5 border-blue-400 text-blue-600 bg-blue-50">Real</Badge>
                      )}
                    </div>
                    {isDisabled ? (
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={(e) => { e.stopPropagation(); handleRechargeInDialog(card.id); }}>Recarregar</Button>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-background">{card.uses_left} usos</Badge>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-3">
            <div className="text-center sm:text-left flex flex-col justify-center">
              {(() => {
                const valorPorUso = (gameSettings?.custo_recarga_cartela || 0) / (gameSettings?.usos_por_recarga || 1);
                const effectivePrice = Math.max(0, (selectedMatch?.card_price || 0) - valorPorUso);
                const totalCost = cardsToJoin.size * effectivePrice;
                return (
                  <>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none">
                      {totalCost > 0 ? 'Total a Pagar (Diferença)' : 'Custo Adicional'}
                    </p>
                    <p className="text-xl font-black font-heading mt-0.5 text-primary">
                      {totalCost.toFixed(2)} cr.
                    </p>
                  </>
                );
              })()}
            </div>
            <Button onClick={handleJoinMatch} disabled={cardsToJoin.size === 0 || isJoining} className="w-full sm:w-auto h-12">
              {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Entrada'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Lobby;