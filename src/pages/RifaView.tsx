import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useRifas } from '@/hooks/useRifas';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Ticket,
  ArrowLeft,
  Calendar,
  DollarSign,
  Trophy,
  XCircle,
  ChevronDown,
  ChevronUp,
  Coins,
  Tag,
  Store,
  Globe,
  CheckCircle2,
  Crown
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Rifa } from '@/types/rifa';
import { cn } from '@/lib/utils';
import { useGame } from '@/contexts/GameContext';
import { useVendedor } from '@/hooks/useVendedor';

type NumberFilter = 'todos' | 'disponivel' | 'vendido';

const statusBadge = (status: Rifa['status']) => {
  if (status === 'ativa') return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">Ativa</Badge>;
  if (status === 'cancelada') return <Badge variant="secondary">Cancelada</Badge>;
  return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">Finalizada</Badge>;
};

const RifaView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCodigo = searchParams.get('ref') || undefined;
  const { profile } = useAuth();
  const { rifas, isLoadingRifas, getRifa, getNumerosRifa, comprarNumeros, minhasCompras, confirmarRecebimento } = useRifas();
  const { gameSettings } = useGame();
  const { meuVendedor, reservarNumeros } = useVendedor();

  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [filter, setFilter] = useState<NumberFilter>('todos');
  const [showRegulamento, setShowRegulamento] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [winnerProfile, setWinnerProfile] = useState<any>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const rifa = id ? getRifa(id) : undefined;
  const numeros = id ? getNumerosRifa(id) : [];

  // Salva o link de indicação na sessão local caso a pessoa tenha clicado e ainda não fez login
  useEffect(() => {
    if (refCodigo) {
      localStorage.setItem('bingo_ref', refCodigo);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refCodigo]);

  useEffect(() => {
    if (rifa?.status === 'finalizada' && rifa.ganhador_id) {
      supabase.rpc('get_public_profiles', { p_user_ids: [rifa.ganhador_id] })
        .then(({ data }) => {
          if (data && data.length > 0) {
            setWinnerProfile(data[0]);
          }
        });
    }
  }, [rifa?.status, rifa?.ganhador_id]);

  const stats = useMemo(() => {
    const total = rifa?.quantidade_numeros ?? 0;
    const sold = numeros.filter(n => n.status === 'vendido').length;
    const available = numeros.filter(n => n.status === 'disponivel').length;
    const percentage = total > 0 ? Math.round((sold / total) * 100) : 0;
    return { total, sold, available, percentage };
  }, [numeros, rifa]);

  const allNumbers = useMemo(() => {
    if (!rifa) return [];
    const start = rifa.numero_inicial;
    const end = start + rifa.quantidade_numeros - 1;
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [rifa]);

  const filteredNumbers = useMemo(() => {
    if (filter === 'todos') return allNumbers;
    return allNumbers.filter(n => {
      const found = numeros.find(nr => nr.numero === n);
      const status = found?.status ?? 'disponivel';
      if (filter === 'disponivel') return status === 'disponivel';
      if (filter === 'vendido') return status === 'vendido' || status === 'reservado';
      return true;
    });
  }, [allNumbers, numeros, filter]);

  const premioFotosParsed = useMemo(() => {
    if (!rifa?.premio_fotos) return [];
    if (Array.isArray(rifa.premio_fotos)) return rifa.premio_fotos;
    if (typeof rifa.premio_fotos === 'string') {
      try {
        return JSON.parse(rifa.premio_fotos);
      } catch (e) {
        return [rifa.premio_fotos];
      }
    }
    return [];
  }, [rifa?.premio_fotos]);

  const meusNumeros = useMemo(() => {
    if (!profile) return [];
    const comprasDestaRifa = minhasCompras.filter(c => c.rifa_id === id).flatMap(c => c.numeros);
    const numsDaTabela = numeros.filter(n => n.comprador_id === profile.id).map(n => n.numero);
    
    return [...new Set([...comprasDestaRifa, ...numsDaTabela])].sort((a,b) => a-b);
  }, [minhasCompras, numeros, profile, id]);

  const toggleNumber = (num: number) => {
    const found = numeros.find(n => n.numero === num);
    if (found && found.status !== 'disponivel') return;
    setSelectedNumbers(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const isVendedor = profile?.role === 'vendedor';
  const descontoVendedor = isVendedor ? (meuVendedor?.percentual_desconto || gameSettings?.desconto_vendedor_global || 0) : 0;
  
  const totalPriceOriginal = rifa ? selectedNumbers.length * rifa.custo_por_numero : 0;
  const totalPriceDiscounted = totalPriceOriginal * (1 - (descontoVendedor / 100));

  const handleComprar = async () => {
    if (!id || selectedNumbers.length === 0) return;
    setIsBuying(true);
    
    let success = false;
    if (isVendedor) {
      // O vendedor compra diretamente usando seu desconto (pagamento com saldo deduzido na hora = false para pagar_depois)
      success = await reservarNumeros(id, selectedNumbers, false);
    } else {
      const ref = localStorage.getItem('bingo_ref') || undefined;
      success = await comprarNumeros(id, selectedNumbers, ref);
    }
    
    if (success) setSelectedNumbers([]);
    setIsBuying(false);
  };

  if (isLoadingRifas && !rifa) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!rifa) {
    return (
      <div className="card-container text-center py-20 space-y-4">
        <Ticket className="w-12 h-12 text-muted-foreground/40 mx-auto" />
        <p className="text-muted-foreground text-lg">Rifa não encontrada.</p>
        <Button variant="outline" onClick={() => navigate('/rifas')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar às Rifas
        </Button>
      </div>
    );
  }

  const numeroGanhadorInfo = numeros.find(n => n.numero === rifa?.numero_ganhador);
  const winnerName = numeroGanhadorInfo?.nome_comprador || winnerProfile?.full_name || 'Usuário não identificado';
  const isVendaFisica = !!numeroGanhadorInfo?.vendedor_id;
  const vendedorNome = (numeroGanhadorInfo as any)?.vendedores_rifa?.nome;

  const didIWin = profile && rifa?.ganhador_id === profile.id;
  const didIConfirm = didIWin && rifa?.ganhador_confirmou;

  const handleConfirmReceipt = async () => {
    if (!rifa) return;
    setIsConfirming(true);
    await confirmarRecebimento(rifa.id);
    setIsConfirming(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rifas')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading text-xl font-bold truncate">{rifa.nome}</h1>
        </div>
        {statusBadge(rifa.status)}
      </div>

      {(refCodigo || localStorage.getItem('bingo_ref')) && (
        <div className="flex items-center gap-2 p-2.5 bg-primary/10 border border-primary/30 rounded-lg text-sm text-primary font-medium">
          <Tag className="w-4 h-4 shrink-0" />
          Indicação ativa: código <span className="font-mono font-bold">{refCodigo || localStorage.getItem('bingo_ref')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          {rifa.foto_capa ? (
            <img
              src={rifa.foto_capa}
              alt={rifa.nome}
              className="w-full max-h-64 object-cover rounded-lg shadow-sm"
              onError={e => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <div className="w-full h-48 rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center shadow-sm">
              <Ticket className="w-16 h-16 text-primary/50" />
            </div>
          )}

          <div className="card-container space-y-4">
            {rifa.descricao && (
              <p className="text-sm text-muted-foreground">{rifa.descricao}</p>
            )}

            {(rifa.premio_descricao || premioFotosParsed.length > 0) && (
              <div className="border rounded-xl p-3 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700/30 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4" /> Prêmio
                </p>
                {premioFotosParsed.length > 0 && (
                  <div className={`grid gap-2 ${premioFotosParsed.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {premioFotosParsed.map((url: string, i: number) => (
                      <img 
                        key={i} 
                        src={url} 
                        alt={`Foto do prêmio ${i + 1}`} 
                        className="w-full max-h-40 object-cover rounded-lg shadow-sm" 
                        onError={e => (e.currentTarget.style.display = 'none')}
                      />
                    ))}
                  </div>
                )}
                {rifa.premio_descricao && (
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{rifa.premio_descricao}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm bg-muted/30 p-3 rounded-lg border border-border/50">
              <span className="flex items-center gap-1.5 font-medium">
                <DollarSign className="w-4 h-4 text-green-600" />
                {rifa.custo_por_numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / número
              </span>
              {rifa.data_encerramento && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Encerra: {format(new Date(rifa.data_encerramento), 'dd/MM/yyyy', { locale: ptBR })}
                </span>
              )}
            </div>

            {rifa.regulamento && (
              <div>
                <button
                  className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  onClick={() => setShowRegulamento(v => !v)}
                >
                  {showRegulamento ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Ver regulamento
                </button>
                {showRegulamento && (
                  <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line p-3 bg-muted/50 rounded-lg">
                    {rifa.regulamento}
                  </p>
                )}
              </div>
            )}

            <div className="pt-2">
              <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1.5">
                <span>{stats.sold} de {stats.total} números vendidos</span>
                <span className="font-bold text-foreground">{stats.percentage}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden shadow-inner">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>
            </div>

            {meusNumeros.length > 0 && (
              <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-4 mt-2">
                <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Seus Números Comprados ({meusNumeros.length})
                </p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                  {meusNumeros.map(n => (
                    <span key={n} className="bg-primary text-primary-foreground text-sm font-bold font-mono px-2.5 py-1 rounded shadow-sm">
                      {String(n).padStart(3, '0')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {rifa.status === 'finalizada' && (
            <div className="card-container space-y-4 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold border-b border-blue-200 dark:border-blue-800/50 pb-3">
                <Trophy className="w-5 h-5" />
                Resultado do Sorteio
              </div>
              
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] uppercase tracking-widest font-bold text-blue-600/70 dark:text-blue-400">Número Sorteado</span>
                <span className="text-5xl font-black font-heading text-blue-700 dark:text-blue-300 bg-white dark:bg-black/20 px-8 py-3 rounded-2xl border-2 border-blue-200 dark:border-blue-800 shadow-sm">
                  {rifa.numero_ganhador !== null ? String(rifa.numero_ganhador).padStart(3, '0') : '—'}
                </span>
              </div>

              {didIWin && !didIConfirm && (
                <div className="bg-green-500 text-white rounded-xl p-5 shadow-lg animate-pulse flex flex-col items-center text-center gap-3 mt-4">
                  <Crown className="w-10 h-10 mb-1" />
                  <h3 className="font-heading font-black text-xl">PARABÉNS, VOCÊ GANHOU!</h3>
                  <p className="text-sm font-medium opacity-90">
                    Você foi o grande vencedor desta rifa. Clique no botão abaixo para confirmar que viu e recebeu seu prêmio.
                  </p>
                  <Button
                    variant="secondary"
                    className="w-full mt-2 font-bold text-green-700 hover:text-green-800 bg-white hover:bg-green-50"
                    onClick={handleConfirmReceipt}
                    disabled={isConfirming}
                  >
                    {isConfirming ? 'Confirmando...' : 'CONFIRMAR RECEBIMENTO'}
                  </Button>
                </div>
              )}

              {didIWin && didIConfirm && (
                <div className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 rounded-xl p-4 border border-green-300 dark:border-green-800 flex items-center gap-3 mt-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <h3 className="font-bold text-sm">Você é o ganhador!</h3>
                    <p className="text-xs opacity-80">Você já confirmou o recebimento deste prêmio.</p>
                  </div>
                </div>
              )}

              {rifa.numero_ganhador !== null && (
                <div className="space-y-3 bg-white dark:bg-black/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/50 mt-2">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Ganhador</p>
                    <p className="font-semibold text-foreground text-sm">{winnerName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-blue-50 dark:border-blue-800/30 pt-3">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Sorteio em</p>
                      <p className="text-xs font-medium">{rifa.data_encerramento ? format(new Date(rifa.data_encerramento), 'dd/MM/yyyy HH:mm') : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Tipo de Compra</p>
                      {isVendaFisica ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          <Store className="w-3 h-3" /> Físico
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          <Globe className="w-3 h-3" /> App Online
                        </span>
                      )}
                    </div>
                  </div>

                  {isVendaFisica && vendedorNome && (
                    <div className="border-t border-blue-50 dark:border-blue-800/30 pt-3">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Vendedor Responsável</p>
                      <p className="text-xs font-medium text-foreground">{vendedorNome}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {rifa.status === 'cancelada' && (
            <div className="card-container space-y-1 border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-2 text-destructive font-bold">
                <XCircle className="w-5 h-5" />
                Rifa cancelada
              </div>
              <p className="text-xs text-muted-foreground">Esta rifa foi cancelada e não aceita mais participações.</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="card-container space-y-4">
            <h2 className="font-heading font-bold text-base">Selecione seus números</h2>

            <div className="flex flex-wrap gap-2">
              {(['todos', 'disponivel', 'vendido'] as NumberFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                    filter === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-transparent hover:border-primary/30'
                  )}
                >
                  {f === 'todos' ? 'Todos' : f === 'disponivel' ? 'Disponíveis' : 'Vendidos'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
              {filteredNumbers.map(num => {
                const found = numeros.find(n => n.numero === num);
                const status = found?.status ?? 'disponivel';
                const isSelected = selectedNumbers.includes(num);
                const isMine = meusNumeros.includes(num);

                if (isMine) {
                  return (
                    <button
                      key={num}
                      disabled
                      title="Você comprou este número"
                      className="aspect-square rounded text-[10px] font-bold bg-primary text-primary-foreground border border-primary/50 cursor-default shadow-sm ring-1 ring-primary ring-offset-1"
                    >
                      {num}
                    </button>
                  );
                }

                if (status === 'vendido') {
                  return (
                    <button
                      key={num}
                      disabled
                      className="aspect-square rounded text-[10px] font-bold bg-red-100 text-red-500 dark:bg-red-900/20 cursor-not-allowed opacity-60"
                    >
                      {num}
                    </button>
                  );
                }

                if (status === 'reservado') {
                  return (
                    <button
                      key={num}
                      disabled
                      className="aspect-square rounded text-[10px] font-bold bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 cursor-not-allowed opacity-60"
                    >
                      {num}
                    </button>
                  );
                }

                return (
                  <button
                    key={num}
                    onClick={() => rifa.status === 'ativa' && toggleNumber(num)}
                    disabled={rifa.status !== 'ativa'}
                    className={cn(
                      'aspect-square rounded text-[10px] font-bold transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-primary/20',
                      rifa.status !== 'ativa' && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>

          {rifa.status === 'ativa' && (
            <div className="card-container space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedNumbers.length} número(s) selecionado(s)
                </span>
                <div className="text-right">
                  {isVendedor && descontoVendedor > 0 ? (
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground line-through">
                          R$ {totalPriceOriginal.toFixed(2)}
                        </span>
                        <Badge className="bg-amber-500/10 text-amber-600 border-none text-[10px]">
                          -{descontoVendedor}% de Desconto
                        </Badge>
                      </div>
                      <span className="text-lg font-black text-primary">
                        Total: R$ {totalPriceDiscounted.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold">
                      Total: R$ {totalPriceOriginal.toFixed(2)} ({totalPriceOriginal} créditos)
                    </span>
                  )}
                </div>
              </div>

              {!profile ? (
                <Button className="w-full gradient-primary font-bold h-12" onClick={() => navigate('/login')}>
                  Fazer Login para Comprar
                </Button>
              ) : (
                <Button
                  className="w-full gradient-primary font-bold h-12"
                  disabled={selectedNumbers.length === 0 || isBuying}
                  onClick={handleComprar}
                >
                  {isBuying ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Ticket className="w-5 h-5 mr-2" />
                  )}
                  Comprar {selectedNumbers.length > 0 ? `${selectedNumbers.length} ` : ''}número{selectedNumbers.length !== 1 ? 's' : ''}
                </Button>
              )}

              {profile != null && (
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Coins className="w-3.5 h-3.5" />
                  Seus créditos: <span className="font-semibold text-foreground">{profile.credits}</span>
                </p>
              )}
            </div>
          )}

          {rifa.status !== 'ativa' && (
            <div className="card-container text-center py-6 text-muted-foreground text-sm">
              {rifa.status === 'finalizada'
                ? 'Esta rifa foi encerrada. Não é possível comprar números.'
                : 'Esta rifa foi cancelada. Não é possível comprar números.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RifaView;