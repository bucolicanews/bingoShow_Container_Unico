import { useState, useEffect, useRef } from 'react';
import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GameType } from '@/types/bingo';
import { PrizeType, MatchStatus, Match, Prize } from '@/types/match';
import { gameTypeLabels, calculateNumbersToWin } from '@/utils/bingoUtils';
import { Plus, Trash2, Trophy, Edit, Shuffle, Clock, Coins, Users, TrendingUp, Ticket, User, Flame, Target, Loader2, ArrowRight, Eye, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { MatchDetailsModal } from './MatchDetailsModal';
import { useQueryClient } from '@tanstack/react-query';
import { LiveBroadcaster } from '@/components/LiveBroadcaster';
import { LiveViewer } from '@/components/LiveViewer';
import { MatchCommentsPanel } from '@/components/MatchCommentsPanel';
import { TieBreakModal } from '@/components/TieBreakModal';

const statusLabels: Record<MatchStatus, string> = {
  waiting: 'Aguardando',
  open: 'Aberta',
  in_progress: 'Em andamento',
  finished: 'Finalizada',
};

const statusColors: Record<MatchStatus, string> = {
  waiting: 'bg-muted text-muted-foreground',
  open: 'bg-primary/10 text-primary',
  in_progress: 'bg-accent/10 text-accent',
  finished: 'bg-success/10 text-success',
};

const MatchManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    matches, createMatch, updateMatch, matchCards,
    openMatch, startMatch, finishMatch, deleteMatch, callNumber,
    toggleAutoCall, nextFestivalRound, gameSettings
  } = useGame();

  const [showCreate, setShowCreate] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [detailsMatch, setDetailsMatch] = useState<Match | null>(null);
  
  // Estado Unificado
  const [matchForm, setMatchForm] = useState({
    name: '',
    gameType: 'full' as GameType,
    maxCardsPerPlayer: 3,
    cardPrice: 10,
    startTime: '',
    min_players: 1,
    is_auto_calling: false,
    
    // Legacy Single Prize
    prizeType: 'percentage' as PrizeType,
    prizeValue: 70,
    prizeName: '',
    prizeImageFile: null as File | null,
    
    // Festival Mode
    is_festival: false,
    prizes: [{ type: 'product', value: 0, productName: '1º Prêmio' }] as Prize[],
  });
  
  const [callerInput, setCallerInput] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [isCallingRandom, setIsCallingRandom] = useState<string | null>(null);
  const [isCallingManual, setIsCallingManual] = useState<string | null>(null);
  const [isAdvancingRound, setIsAdvancingRound] = useState<string | null>(null);
  const [expandedNumbers, setExpandedNumbers] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [matchIdForDialog, setMatchIdForDialog] = useState<string | null>(null);
  const [editingNumber, setEditingNumber] = useState<{ matchId: string; oldNumber: number; newNumber: string } | null>(null);
  const [isCorrectingNumber, setIsCorrectingNumber] = useState(false);
  const manualInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const focusManualInput = (matchId: string) => {
    window.setTimeout(() => {
      const el = manualInputRefs.current[matchId];
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('match-manager-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidas' }, () => {
        queryClient.invalidateQueries({ queryKey: ['matches'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const handleCreateMatch = async () => {
    if (!matchForm.name.trim() || !matchForm.startTime) return;
    if (matchForm.cardPrice < 0) {
      toast.error('O preço da partida não pode ser menor que 0.');
      return;
    }

    let matchData: any = {
        name: matchForm.name,
        game_type: matchForm.gameType,
        max_cards_per_player: matchForm.maxCardsPerPlayer,
        card_price: matchForm.cardPrice,
        start_time: new Date(matchForm.startTime).toISOString(),
        min_players: matchForm.min_players,
        is_auto_calling: matchForm.is_auto_calling,
        is_festival: matchForm.is_festival,
    };

    if (matchForm.is_festival) {
        matchData.prizes = matchForm.prizes;
        matchData.prize = matchForm.prizes[0]; // Set first prize as active
        matchData.current_round = 0;
        matchData.completed_rounds = [];
    } else {
        let prizeImageUrl: string | undefined = undefined;
        if (matchForm.prizeType === 'product' && matchForm.prizeImageFile) {
            const file = matchForm.prizeImageFile;
            const filePath = `public/${Date.now()}_${file.name.replace(/\s/g, '_')}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
                prizeImageUrl = publicUrl;
            }
        }
        matchData.prize = { type: matchForm.prizeType, value: matchForm.prizeValue };
        if (matchForm.prizeType === 'product') matchData.prize.productName = matchForm.prizeName;
        matchData.prize_image_url = prizeImageUrl;
        matchData.prizes = [];
    }

    await createMatch(matchData);
    setShowCreate(false);
  };

  const handleOpenEditDialog = (match: Match) => {
    setEditingMatch(match);
    setMatchForm({
      name: match.name,
      gameType: match.game_type,
      maxCardsPerPlayer: match.max_cards_per_player,
      cardPrice: match.card_price,
      startTime: format(new Date(match.start_time), "yyyy-MM-dd'T'HH:mm"),
      min_players: match.min_players,
      is_auto_calling: match.is_auto_calling || false,
      
      prizeType: match.prize.type,
      prizeValue: match.prize.value || 0,
      prizeName: match.prize.productName || '',
      prizeImageFile: null,
      
      is_festival: match.is_festival || false,
      prizes: match.prizes && match.prizes.length > 0 ? match.prizes : [{ type: 'product', value: 0, productName: '' }],
    });
  };

  const handleUpdateMatch = async () => {
    if (!editingMatch) return;
    if (matchForm.cardPrice < 0) {
      toast.error('O preço da partida não pode ser menor que 0.');
      return;
    }
    
    let matchData: any = {
        name: matchForm.name,
        game_type: matchForm.gameType,
        max_cards_per_player: matchForm.maxCardsPerPlayer,
        card_price: matchForm.cardPrice,
        start_time: new Date(matchForm.startTime).toISOString(),
        min_players: matchForm.min_players,
        is_auto_calling: matchForm.is_auto_calling,
        is_festival: matchForm.is_festival,
    };

    if (matchForm.is_festival) {
        matchData.prizes = matchForm.prizes;
        if (editingMatch.current_round === 0) {
            matchData.prize = matchForm.prizes[0];
        }
    } else {
        matchData.prize = { type: matchForm.prizeType, value: matchForm.prizeValue };
        if (matchForm.prizeType === 'product') matchData.prize.productName = matchForm.prizeName;
    }

    await updateMatch(editingMatch.id, matchData);
    setEditingMatch(null);
  };

  const addFestivalPrize = () => {
      setMatchForm(p => ({ ...p, prizes: [...p.prizes, { type: 'product', value: 0, productName: `Prêmio ${p.prizes.length + 1}` }] }));
  };

  const removeFestivalPrize = (index: number) => {
      setMatchForm(p => ({ ...p, prizes: p.prizes.filter((_, i) => i !== index) }));
  };

  const updateFestivalPrize = (index: number, field: keyof Prize, value: any) => {
      setMatchForm(p => {
          const newPrizes = [...p.prizes];
          newPrizes[index] = { ...newPrizes[index], [field]: value };
          return { ...p, prizes: newPrizes };
      });
  };

  const handleCallNumber = async (matchId: string, inputValue?: string) => {
    const liveInputValue = manualInputRefs.current[matchId]?.value ?? '';
    const rawValue = typeof inputValue === 'string' ? inputValue : (liveInputValue || callerInput[matchId] || '');
    const num = parseInt(rawValue, 10);

    if (!(num >= 1 && num <= 75)) {
      toast.error('Número inválido', {
        description: 'Digite um número entre 1 e 75.',
      });
      focusManualInput(matchId);
      return;
    }

    setIsCallingManual(matchId);
    try {
      await callNumber(matchId, num);
      setCallerInput(prev => ({ ...prev, [matchId]: '' }));
    } finally {
      setIsCallingManual(null);
      focusManualInput(matchId);
    }
  };

  const handleRandomCall = async (matchId: string) => {
    setIsCallingRandom(matchId);
    const match = matches.find(m => m.id === matchId);
    if (!match) {
      setIsCallingRandom(null);
      return;
    }
    const availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1).filter(num => !(match.called_numbers || []).includes(num));
    if (availableNumbers.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      await callNumber(match.id, availableNumbers[randomIndex]);
    } else {
      toast({ title: 'Todos os números já foram sorteados!', variant: 'destructive' });
    }
    setIsCallingRandom(null);
  };

  const handleNextRound = async (matchId: string) => {
    setIsAdvancingRound(matchId);
    await nextFestivalRound(matchId);
    setIsAdvancingRound(null);
  };

  const handleCorrectNumber = async () => {
    if (!editingNumber) return;
    const newNum = parseInt(editingNumber.newNumber, 10);
    if (newNum < 1 || newNum > 75) {
      toast.error('Número inválido', { description: 'O número deve estar entre 1 e 75.' });
      return;
    }
    if (newNum === editingNumber.oldNumber) {
      toast.error('Sem alteração', { description: 'O novo número é igual ao anterior.' });
      return;
    }
    setIsCorrectingNumber(true);
    try {
      const { data, error } = await (supabase as any).rpc('correct_called_number', {
        p_match_id: editingNumber.matchId,
        p_old_number: editingNumber.oldNumber,
        p_new_number: newNum,
      });
      setIsCorrectingNumber(false);
      if (error) {
        console.error('[correct-number] RPC Error:', error);
        toast.error('Erro ao corrigir número', { description: error.message });
        return;
      }
      if (!data?.success) {
        console.error('[correct-number] Operation failed:', data?.error);
        const errorMsg = data?.error === 'new_number_already_called' 
          ? 'Este número já foi chamado!' 
          : data?.error === 'auto_calling_not_allowed'
            ? 'Correção só é permitida em chamada manual (desative o automático).'
          : data?.error === 'old_number_not_found' 
            ? 'Número original não encontrado!' 
            : data?.error || 'Erro desconhecido';
        toast.error('Erro ao corrigir número', { description: errorMsg });
        return;
      }
      console.log('[correct-number] Success:', data);
      toast.success('Número corrigido', { 
        description: `${editingNumber.oldNumber} alterado para ${newNum}.` 
      });
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
      setEditingNumber(null);
    } catch (err: any) {
      setIsCorrectingNumber(false);
      console.error('[correct-number] Exception:', err);
      toast.error('Erro ao corrigir número', { description: err.message });
    }
  };

  const handleRefreshBeforeDialog = async (matchId: string) => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries();
      // Dialog abre com dados atualizados
    } catch (error) {
      toast({ title: 'Erro ao atualizar dados', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
      setMatchIdForDialog(matchId);
    }
  };

  const handleConfirmStartMatch = async (matchId: string, force: boolean, playersInMatchCount: number) => {
    setIsRefreshing(true);
    try {
      if (playersInMatchCount === 0) {
        await deleteMatch(matchId);
        toast({ title: 'Partida vazia excluída!', variant: 'default' });
      } else {
        await startMatch(matchId, force);
        toast({ title: 'Partida iniciada com sucesso!', variant: 'default' });
      }
    } catch (error) {
      toast({ title: 'Erro ao processar ação', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
      setMatchIdForDialog(null);
    }
  };

  const matchDialogContent = (
    <div className="space-y-4 py-4">
      <div><Label>Nome</Label><Input value={matchForm.name} onChange={e => setMatchForm(p => ({ ...p, name: e.target.value }))} /></div>
      <div><Label>Data/Hora Início</Label><Input type="datetime-local" value={matchForm.startTime} onChange={e => setMatchForm(p => ({ ...p, startTime: e.target.value }))} /></div>
      <div><Label>Tipo de Jogo</Label><Select value={matchForm.gameType} onValueChange={(v: GameType) => setMatchForm(p => ({ ...p, gameType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(gameTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-4">
          <div><Label>Preço</Label><Input type="number" min={0} step="0.01" value={matchForm.cardPrice} onChange={e => setMatchForm(p => ({ ...p, cardPrice: Math.max(0, Number(e.target.value)) }))} /></div>
          <div><Label>Máx. Cartelas</Label><Input type="number" value={matchForm.maxCardsPerPlayer} onChange={e => setMatchForm(p => ({ ...p, maxCardsPerPlayer: +e.target.value }))} /></div>
      </div>
      
      <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg">
          <div>
              <Label className="text-purple-900 dark:text-purple-300 font-bold">Bingo Comunitário (Festival)</Label>
              <p className="text-[10px] text-purple-700/70">Múltiplos prêmios sequenciais na mesma cartela.</p>
          </div>
          <Switch checked={matchForm.is_festival} onCheckedChange={c => setMatchForm(p => ({ ...p, is_festival: c }))} />
      </div>

      {matchForm.is_festival ? (
        <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
            <Label className="font-bold border-b pb-1 mb-2 block">Rodadas de Prêmios</Label>
            {matchForm.prizes.map((pz, idx) => (
                <div key={idx} className="p-3 bg-background border rounded-lg relative">
                    <div className="absolute top-2 right-2 text-xs font-bold text-muted-foreground">#{idx + 1}</div>
                    <Label className="text-xs mb-1 block">Tipo de Prêmio</Label>
                    <Select value={pz.type} onValueChange={(v: any) => updateFestivalPrize(idx, 'type', v)}>
                        <SelectTrigger className="mb-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="product">Produto / Objeto</SelectItem>
                            <SelectItem value="fixed">Valor Fixo (Créditos)</SelectItem>
                            <SelectItem value="percentage">% do Pote</SelectItem>
                        </SelectContent>
                    </Select>
                    
                    {pz.type === 'product' && (
                        <Input placeholder="O que é? Ex: Frango Assado" value={pz.productName || ''} onChange={e => updateFestivalPrize(idx, 'productName', e.target.value)} className="h-8 text-xs" />
                    )}
                    {(pz.type === 'fixed' || pz.type === 'percentage') && (
                        <Input type="number" placeholder="Valor numérico" value={pz.value || ''} onChange={e => updateFestivalPrize(idx, 'value', +e.target.value)} className="h-8 text-xs" />
                    )}
                    {matchForm.prizes.length > 1 && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive mt-1 px-2" onClick={() => removeFestivalPrize(idx)}>
                            <Trash2 className="w-3 h-3 mr-1" /> Remover Rodada
                        </Button>
                    )}
                </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={addFestivalPrize}>
                <Plus className="w-4 h-4 mr-2" /> Adicionar Próxima Rodada
            </Button>
        </div>
      ) : (
        <>
            <div>
            <Label>Tipo de Prêmio (Único)</Label>
            <RadioGroup value={matchForm.prizeType} onValueChange={(v: PrizeType) => setMatchForm(p => ({ ...p, prizeType: v }))} className="grid grid-cols-3 gap-2 mt-2">
                <div><RadioGroupItem value="percentage" id="percentage" className="peer sr-only" /><Label htmlFor="percentage" className="flex text-xs items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent peer-data-[state=checked]:border-primary">% do Pote</Label></div>
                <div><RadioGroupItem value="fixed" id="fixed" className="peer sr-only" /><Label htmlFor="fixed" className="flex text-xs items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent peer-data-[state=checked]:border-primary">Fixo</Label></div>
                <div><RadioGroupItem value="product" id="product" className="peer sr-only" /><Label htmlFor="product" className="flex text-xs items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent peer-data-[state=checked]:border-primary">Produto</Label></div>
            </RadioGroup>
            </div>
            {matchForm.prizeType === 'percentage' && <div><Label>Porcentagem (%)</Label><Input type="number" value={matchForm.prizeValue} onChange={e => setMatchForm(p => ({ ...p, prizeValue: +e.target.value }))} /></div>}
            {matchForm.prizeType === 'fixed' && <div><Label>Valor Fixo (cr)</Label><Input type="number" value={matchForm.prizeValue} onChange={e => setMatchForm(p => ({ ...p, prizeValue: +e.target.value }))} /></div>}
            {matchForm.prizeType === 'product' && (
            <div className="space-y-3">
                <div><Label>Nome do Produto</Label><Input value={matchForm.prizeName} onChange={e => setMatchForm(p => ({ ...p, prizeName: e.target.value }))} /></div>
            </div>
            )}
        </>
      )}

      <div>
        <Label>Mínimo de Jogadores</Label>
        <Input type="number" value={matchForm.min_players} onChange={e => setMatchForm(p => ({ ...p, min_players: +e.target.value }))} />
      </div>
      
      {!matchForm.is_festival && (
        <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm mt-4">
            <div className="space-y-0.5">
                <Label>Início e Sorteio Automáticos</Label>
                <p className="text-[10px] text-muted-foreground">Disponível apenas para partida simples.</p>
            </div>
            <Switch checked={matchForm.is_auto_calling} onCheckedChange={(c) => setMatchForm(p => ({ ...p, is_auto_calling: c }))} />
        </div>
      )}
    </div>
  );

  const getCountdown = (time: string | number | undefined | null) => {
    if (!time) return null;
    const diff = new Date(time).getTime() - now;
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h > 0 ? `${h.toString().padStart(2, '0')}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  const renderMatchList = (matchesToRender: Match[]) => {
    if (matchesToRender.length === 0) return <div className="card-container text-center py-12"><p className="text-sm text-muted-foreground">Nenhuma partida nesta categoria.</p></div>;
    return (
      <div className="space-y-6">
        {matchesToRender.map(match => {
          const cardsInMatch = matchCards.filter(mc => mc.match_id === match.id);
          const playersInMatchCount = new Set(cardsInMatch.map(mc => mc.player_id)).size;
          const totalCardsCount = cardsInMatch.length;
          const tiedPlayerNames: Record<string, string> = {};
          if (match.tie_break_status === 'pending' || match.tie_break_status === 'resolved') {
            const tiedWinners = (match.winners || []).filter((w: any) => w.creditType === 'real');
            tiedWinners.forEach((w: any) => { tiedPlayerNames[w.playerId] = w.playerName; });
          }
          
          const prizeValue = match.prize.type === 'percentage' 
            ? Math.floor((match.pot * (match.prize.value || 0)) / 100) 
            : (match.prize.value || 0);
          
          const profit = match.pot - prizeValue;
          const canStart = playersInMatchCount >= match.min_players;
          const countdown = (match.status === 'waiting' || match.status === 'open') ? getCountdown(match.start_time) : null;

          const isFestival = match.is_festival;
          const hasMoreRounds = isFestival && (match.current_round ?? 0) < (match.prizes?.length || 0) - 1;

          return (
            <div key={match.id} className={cn("card-container border-2 overflow-x-hidden", isFestival ? 'border-purple-500/30 shadow-md' : 'border-transparent')}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-heading font-bold text-lg text-foreground flex items-center gap-2">
                        {isFestival && <Trophy className="w-4 h-4 text-purple-500" />}
                        {match.name}
                    </h3>
                    <Badge className={statusColors[match.status]}>{statusLabels[match.status]}</Badge>
                    {isFestival && <Badge className="bg-purple-100 text-purple-800 border-purple-300">Festival (Rodada {(match.current_round||0)+1}/{match.prizes?.length})</Badge>}
                    {countdown && <Badge variant="outline" className="font-mono text-xs"><Clock className="w-3 h-3 mr-1.5" />{countdown}</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground flex gap-3"><span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />{gameTypeLabels[match.game_type]}</span></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" className="flex-1 sm:flex-none" onClick={() => setDetailsMatch(match)}>
                    <Eye className="w-4 h-4 mr-1" /> Detalhes
                  </Button>
                  
                  {/* EDITAR PERMITIDO PARA WAITING OU OPEN */}
                  {(match.status === 'waiting' || match.status === 'open') && (
                    <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => handleOpenEditDialog(match)}>
                      <Edit className="w-4 h-4 mr-1" /> Editar
                    </Button>
                  )}

                  {match.status === 'waiting' && <Button size="sm" className="flex-1 sm:flex-none" onClick={() => openMatch(match.id)}>Abrir</Button>}
                  
                  {match.status === 'open' && (
                    <AlertDialog open={matchIdForDialog === match.id} onOpenChange={(open) => !open && setMatchIdForDialog(null)}>
                      <AlertDialogTrigger asChild>
                            <Button size="sm" className="flex-1 sm:flex-none" disabled={isRefreshing} onClick={() => handleRefreshBeforeDialog(match.id)} title={!canStart ? `Requer ${match.min_players} jogadores. Atualmente: ${playersInMatchCount}.` : undefined}>
                              {isRefreshing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                              Iniciar                          
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {playersInMatchCount === 0
                                  ? "Excluir Partida Vazia?"
                                  : (!canStart ? "Forçar início da partida?" : "Iniciar Partida?")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {playersInMatchCount === 0
                                  ? "Esta partida não possui nenhum jogador. Partidas sem jogadores não podem ser iniciadas e devem ser excluídas."
                                  : (!canStart
                                    ? `Esta partida não atingiu o número mínimo de ${match.min_players} jogadores. Deseja forçar o início mesmo assim?`
                                    : "A partida será movida para 'Ao Vivo' e o sorteio poderá começar. Deseja continuar?")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isRefreshing}>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className={playersInMatchCount === 0 ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                                onClick={() => handleConfirmStartMatch(match.id, !canStart, playersInMatchCount)}
                                disabled={isRefreshing}
                              >
                                {isRefreshing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processando...</> : (playersInMatchCount === 0 ? "Excluir Partida" : (!canStart ? "Forçar Início" : "Sim, Iniciar Partida"))}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                    </AlertDialog>
                  )}

                  {match.status === 'in_progress' && <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => finishMatch(match.id)}>Finalizar</Button>}
                  {(match.status === 'waiting' || match.status === 'open' || (match.status === 'finished' && !hasMoreRounds)) && <Button size="sm" variant="destructive" className="flex-1 sm:flex-none" onClick={() => deleteMatch(match.id)}><Trash2 className="w-4 h-4" /></Button>}
                  
                  {/* BOTÃO MÁGICO DO FESTIVAL */}
                  {match.status === 'finished' && hasMoreRounds && (
                      <Button size="sm" className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white font-bold animate-pulse" onClick={() => handleNextRound(match.id)} disabled={isAdvancingRound === match.id}>
                          {isAdvancingRound === match.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                          Iniciar Rodada {(match.current_round||0)+2}
                      </Button>
                  )}
                </div>
              </div>

              {/* Stats Financeiros */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cartelas</p>
                  <p className="font-heading text-lg font-bold">{totalCardsCount}</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Aposta Total</p>
                  <p className="font-heading text-lg font-bold text-primary">{match.pot} cr.</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Prêmio Atual</p>
                  <p className="font-heading text-lg font-bold text-amber-600">
                    {match.prize.type === 'product' ? match.prize.productName : `${prizeValue} cr.`}
                  </p>
                </div>
                <div className={cn("p-3 rounded-lg border", profit >= 0 ? "bg-success/5 border-success/10" : "bg-destructive/5 border-destructive/10")}>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wider", profit >= 0 ? "text-success" : "text-destructive")}>Lucro Previsto</p>
                  <p className={cn("font-heading text-lg font-bold", profit >= 0 ? "text-success" : "text-destructive")}>{profit} cr.</p>
                </div>
              </div>

              {/* Lista de Números Sorteados (Sempre visível se houver números) */}
              {(match.called_numbers || []).length > 0 && (
                <div className="mb-6 p-4 bg-muted/20 rounded-xl border border-border/50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Target className="w-3 h-3" /> Números Sorteados (Último em destaque)
                    </p>
                    {(match.called_numbers || []).length > 10 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] font-bold uppercase sm:hidden"
                        onClick={() => setExpandedNumbers(prev => ({ ...prev, [match.id]: !prev[match.id] }))}
                      >
                        {expandedNumbers[match.id] ? 'Ver Menos' : `Ver Todos (${match.called_numbers.length})`}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const allNums = [...(match.called_numbers || [])].reverse();
                      const isExpanded = expandedNumbers[match.id];
                      const displayNums = isExpanded ? allNums : allNums.slice(0, 10);
                      
                      return (
                        <>
                          {displayNums.map((num, idx) => (
                            <button
                              key={`${match.id}-${num}-${idx}`}
                              onClick={() => setEditingNumber({ matchId: match.id, oldNumber: num, newNumber: String(num) })}
                              className={cn(
                                "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm border transition-all hover:ring-2 hover:ring-amber-400",
                                idx === 0
                                  ? "bg-accent text-accent-foreground border-accent scale-110 ring-2 ring-accent/20 animate-pulse"
                                  : "bg-white dark:bg-background text-foreground border-border hover:border-amber-400"
                              )}
                              title="Clique para corrigir"
                            >
                              {num}
                            </button>
                          ))}
                          {!isExpanded && allNums.length > 10 && (
                            <div className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center text-[10px] font-bold bg-muted text-muted-foreground border border-dashed border-border">
                              +{allNums.length - 10}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Painel Operacional em Progresso */}
              {match.status === 'in_progress' && (
                <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-heading font-semibold text-lg flex items-center gap-2">
                            Mesa de Operação <Badge variant="outline" className="text-xs bg-muted">Bolas: {(match.called_numbers || []).length}</Badge>
                        </h4>
                    </div>
                    <form
                      className="flex flex-wrap gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const manualValue = callerInput[match.id] || '';
                        void handleCallNumber(match.id, manualValue);
                      }}
                    >
                        <Input
                          ref={(el) => { manualInputRefs.current[match.id] = el; }}
                          placeholder="Nº"
                          type="number"
                          min={1}
                          max={75}
                          className="w-16 sm:w-20 font-bold text-center text-lg"
                          value={callerInput[match.id] || ''}
                          onChange={e => setCallerInput(p => ({ ...p, [match.id]: e.target.value }))}
                          disabled={isCallingManual === match.id || isCallingRandom === match.id}
                        />
                        <Button
                          type="submit"
                          className="flex-1 sm:flex-none h-10 px-4 sm:px-8"
                          disabled={isCallingManual === match.id || isCallingRandom === match.id || !callerInput[match.id]}
                        >
                            {isCallingManual === match.id ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Cantar Manual'}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 sm:flex-none h-10 px-4 sm:px-8"
                          onClick={() => handleRandomCall(match.id)}
                          disabled={isCallingRandom === match.id || isCallingManual === match.id}
                        >
                          {isCallingRandom === match.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Shuffle className="w-5 h-5 mr-2" /> Sortear Aleatório</>}
                        </Button>
                        <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 rounded-lg border border-border/50 w-full sm:w-auto">
                          <Switch
                            id={`auto-call-${match.id}`}
                            checked={match.is_auto_calling}
                            onCheckedChange={() => toggleAutoCall(match.id)}
                          />
                          <Label htmlFor={`auto-call-${match.id}`} className="text-xs font-bold cursor-pointer flex flex-col">
                            <span className="flex items-center gap-2">
                              Sorteio Automático
                              {match.is_auto_calling && match.status === 'in_progress' && (
                                <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-accent/10 text-accent border-accent/20 animate-pulse">
                                  <Clock className="w-2 h-2 mr-1" />
                                  {getCountdown(match.next_auto_call_timestamp) || '00:00'}
                                </Badge>
                              )}
                            </span>
                            <span className="text-[9px] text-muted-foreground font-normal">Intervalo: {gameSettings?.intervalo_sorteio_auto_seg}s</span>
                          </Label>
                        </div>
                    </form>
                </div>
              )}

              {match.status === 'in_progress' && (
                <div className="mt-6 pt-6 border-t space-y-5 overflow-x-hidden">
                  <div className="rounded-xl border border-border/60 bg-muted/10 p-3 min-w-0 overflow-hidden">
                    <Tabs defaultValue="controle" className="w-full min-w-0">
                      <TabsList className="grid grid-cols-2 w-full h-auto">
                        <TabsTrigger value="controle" className="text-xs">Controle da Live</TabsTrigger>
                        <TabsTrigger value="monitor" className="text-xs">Monitor da Live</TabsTrigger>
                      </TabsList>

                      <TabsContent value="controle" className="mt-3 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                          Transmissao ao vivo (controle)
                        </p>
                        <div className="min-w-0 overflow-hidden">
                          <LiveBroadcaster matchId={match.id} />
                        </div>
                      </TabsContent>

                      <TabsContent value="monitor" className="mt-3 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                          Visao do publico (monitor)
                        </p>
                        <div className="min-w-0 overflow-hidden">
                          <LiveViewer matchId={match.id} />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>

                  <MatchCommentsPanel
                    matchId={match.id}
                    canSend={match.status === 'open' || match.status === 'in_progress'}
                  />

                  {(match.tie_break_status === 'pending' || match.tie_break_status === 'resolved') && (
                    <TieBreakModal
                      matchId={match.id}
                      playerNames={tiedPlayerNames}
                      winners={match.winners || []}
                      isLive={true}
                      isAutomatic={match.is_auto_calling ?? false}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const inProgressMatches = matches.filter(m => m.status === 'in_progress');
  const openMatches = matches.filter(m => m.status === 'open');
  const waitingMatches = matches.filter(m => m.status === 'waiting');
  const finishedMatches = matches.filter(m => m.status === 'finished');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <h2 className="font-heading text-xl font-bold text-foreground">Gestão de Partidas</h2>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" />Nova Partida</Button></DialogTrigger>
          <DialogContent className="max-w-md flex flex-col max-h-[90vh]">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="font-heading">Criar Partida</DialogTitle>
            </DialogHeader>
            <div className="flex-grow overflow-y-auto -mx-6 px-6">{matchDialogContent}</div>
            <DialogFooter className="flex-shrink-0 pt-4">
              <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
              <Button onClick={handleCreateMatch}>Criar Partida</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Modal de Edição */}
      {/* Dialog de Corrigir Número Chamado */}
      <Dialog open={!!editingNumber} onOpenChange={(open) => !open && setEditingNumber(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-amber-600" />
              Corrigir Número Chamado
            </DialogTitle>
            <DialogDescription>
              Altere o número que foi digitado incorretamente na chamada manual.
            </DialogDescription>
          </DialogHeader>
          {editingNumber && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Número Errado</p>
                  <p className="text-4xl font-bold text-destructive">{editingNumber.oldNumber}</p>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Número Correto (1-75)</p>
                  <Input
                    type="number"
                    min="1"
                    max="75"
                    value={editingNumber.newNumber}
                    onChange={(e) => setEditingNumber({ ...editingNumber, newNumber: e.target.value })}
                    placeholder="Ingrese el número correcto"
                    autoFocus
                    className="text-center text-xl font-bold"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNumber(null)}>Cancelar</Button>
            <Button 
              onClick={handleCorrectNumber} 
              disabled={isCorrectingNumber}
              className="gradient-primary"
            >
              {isCorrectingNumber ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Corrigindo...
                </>
              ) : (
                <>
                  <Edit className="w-4 h-4 mr-2" />
                  Confirmar Correção
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingMatch} onOpenChange={(open) => !open && setEditingMatch(null)}>
        <DialogContent className="max-w-md flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="font-heading">Editar Partida</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto -mx-6 px-6">{matchDialogContent}</div>
          <DialogFooter className="flex-shrink-0 pt-4">
            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
            <Button onClick={handleUpdateMatch}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Modal de Detalhes Completo */}
      <MatchDetailsModal match={detailsMatch} onClose={() => setDetailsMatch(null)} />
      
      <Tabs defaultValue="in_progress" className="w-full">
        <TabsList className="grid w-full h-auto p-1 grid-cols-2 sm:grid-cols-4 mb-6">
          <TabsTrigger value="in_progress" className="flex items-center gap-1.5">
            Ao Vivo
            {inProgressMatches.length > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">{inProgressMatches.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="open" className="flex items-center gap-1.5">
            Abertas
            {openMatches.length > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">{openMatches.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="waiting" className="flex items-center gap-1.5">
            Aguardando
            {waitingMatches.length > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">{waitingMatches.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="finished" className="flex items-center gap-1.5">
            Finalizadas
            {finishedMatches.length > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success text-[9px] font-bold text-white">{finishedMatches.length}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="in_progress" className="mt-2">{renderMatchList(inProgressMatches)}</TabsContent>
        <TabsContent value="open" className="mt-2">{renderMatchList(openMatches)}</TabsContent>
        <TabsContent value="waiting" className="mt-2">{renderMatchList(waitingMatches)}</TabsContent>
        <TabsContent value="finished" className="mt-2">{renderMatchList(finishedMatches)}</TabsContent>
      </Tabs>
    </div>
  );
};

export default MatchManager;