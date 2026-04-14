import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVendedor, NumeroRifaVendedor } from '@/hooks/useVendedor';
import { useVendedorBingo } from '@/hooks/useVendedorBingo';
import { useRifas } from '@/hooks/useRifas';
import { useGame } from '@/contexts/GameContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Loader2, Copy, Link2, CheckSquare, ShoppingBag, UserCheck, Ticket,
  Printer, Plus, Undo2, Grid3X3, DollarSign, Wallet, Upload, CheckCircle2, XCircle,
  BadgePercent, ListChecks, AlertTriangle, WalletCards, Filter, User, HeartHandshake, BadgeDollarSign, Edit, Save
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const VendedorPainel = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  const { meuVendedor, minhasReservas, minhasVendas, meusAcertos, isLoading, reservarNumeros, cancelarReserva, validarMultiplasVendas, enviarAcerto, pagarAcertoComSaldo, pagarComprasComSaldo } = useVendedor();
  const { rifas, getNumerosRifa } = useRifas();
  
  const { matches, gameSettings } = useGame();
  const { folhasEmitidas, comprarFolhasBingo } = useVendedorBingo();

  const [activeTab, setActiveTab] = useState<'rifas' | 'bingo' | 'acertos'>('rifas');

  const [validarOpen, setValidarOpen] = useState(false);
  const [validarNumeros, setValidarNumeros] = useState<NumeroRifaVendedor[]>([]);
  const [validarForm, setValidarForm] = useState({ nome: '', telefone: '', endereco: '' });
  const [isValidando, setIsValidando] = useState(false);
  const [isPagando, setIsPagando] = useState(false);
  
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selectedToValidate, setSelectedToValidate] = useState<Set<string>>(new Set());

  const [reservarOpen, setReservarOpen] = useState(false);
  const [reservarRifaId, setReservarRifaId] = useState('');
  const [reservarSelecionados, setReservarSelecionados] = useState<number[]>([]);
  const [reservarFiado, setReservarFiado] = useState(false);
  const [isReservando, setIsReservando] = useState(false);

  const [cancelarNumero, setCancelarNumero] = useState<NumeroRifaVendedor | null>(null);
  const [isCancelando, setIsCancelando] = useState(false);

  const [detalhesNumero, setDetalhesNumero] = useState<NumeroRifaVendedor | null>(null);
  const [isEditingDetalhes, setIsEditingDetalhes] = useState(false);
  const [editDetalhesForm, setEditDetalhesForm] = useState({ nome: '', telefone: '', endereco: '' });
  const [isSavingDetalhes, setIsSavingDetalhes] = useState(false);

  const [comprarBingoOpen, setComprarBingoOpen] = useState(false);
  const [selectedBingoMatch, setSelectedBingoMatch] = useState('');
  const [qtdFolhasBingo, setQtdFolhasBingo] = useState(1);
  const [bingoFiado, setBingoFiado] = useState(false);
  const [isGerandoFolhas, setIsGerandoFolhas] = useState(false);

  const [selectedFolhas, setSelectedFolhas] = useState<Set<string>>(new Set());
  const [bingoFilterMatchId, setBingoFilterMatchId] = useState<string>('todas');
  const [rifaFilterId, setRifaFilterId] = useState<string>('todas');
  
  const [acertoTipoFilter, setAcertoTipoFilter] = useState<'todos' | 'bingo' | 'rifa'>('todos');
  const [acertoBingoFilterId, setAcertoBingoFilterId] = useState<string>('todas');
  const [acertoRifaFilterId, setAcertoRifaFilterId] = useState<string>('todas');

  const [pagarAcertoOpen, setPagarAcertoOpen] = useState(false);
  const [acertoFile, setAcertoFile] = useState<File | null>(null);
  const [isEnviandoAcerto, setIsEnviandoAcerto] = useState(false);
  const acertoFileRef = useRef<HTMLInputElement>(null);

  const [pagarComSaldoOpen, setPagarComSaldoOpen] = useState(false);
  const [isPagandoComSaldo, setIsPagandoComSaldo] = useState(false);

  const [selectedAcertosBingo, setSelectedAcertosBingo] = useState<Set<string>>(new Set());
  const [selectedAcertosRifa, setSelectedAcertosRifa] = useState<Set<string>>(new Set());

  const manualMatches = useMemo(() => matches.filter(m => m.status === 'open' && !m.is_auto_calling), [matches]);
  const numerosDisponiveis = useMemo(() => getNumerosRifa(reservarRifaId), [reservarRifaId, getNumerosRifa]);
  const rifasAtivas = useMemo(() => rifas.filter(r => r.status === 'ativa'), [rifas]);

  const comissaoAtiva = useMemo(() => {
    const vCom = Number(meuVendedor?.comissao_percentual || 0);
    return vCom > 0 ? vCom : Number(gameSettings?.comissao_vendedor_global || 0);
  }, [meuVendedor, gameSettings]);

  const descontoAtivo = useMemo(() => {
    const vDesc = Number(meuVendedor?.percentual_desconto || 0);
    return vDesc > 0 ? vDesc : Number(gameSettings?.desconto_vendedor_global || 0);
  }, [meuVendedor, gameSettings]);

  const pendingFolhas = useMemo(() => folhasEmitidas.filter(f => f.status === 'pendente'), [folhasEmitidas]);
  const pendingVendas = useMemo(() => minhasVendas.filter(v => v.status === 'pendente'), [minhasVendas]);
  const pendentesTotais = pendingFolhas.length + pendingVendas.length;
  
  // Dashboard Vendedor
  const dividaAtual = pendingFolhas.reduce((a, f) => a + Number(f.valor_pago), 0) + pendingVendas.reduce((a, v) => a + Number(v.valor_total), 0);
  const comissoesGanhas = meusAcertos.filter(a => a.status === 'aprovado').reduce((a, b) => a + Number((b as any).comissao_paga || 0), 0);

  const uniqueBingoMatches = useMemo(() => {
    const map = new Map<string, string>();
    folhasEmitidas.forEach(f => {
      if (f.match_id && f.partidas?.name) {
        map.set(f.match_id, f.partidas.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [folhasEmitidas]);

  const uniqueRifasReservadas = useMemo(() => {
    const map = new Map<string, string>();
    minhasReservas.forEach(r => {
      if (r.rifa_id && r.rifas?.nome && r.rifas?.status === 'ativa') {
        map.set(r.rifa_id, r.rifas.nome);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [minhasReservas]);

  const uniquePendingBingoMatches = useMemo(() => {
    const map = new Map<string, string>();
    pendingFolhas.forEach(f => {
      if (f.match_id && f.partidas?.name) map.set(f.match_id, f.partidas.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [pendingFolhas]);

  const uniquePendingRifas = useMemo(() => {
    const map = new Map<string, string>();
    pendingVendas.forEach(v => {
      if (v.rifa_id && v.rifas?.nome) map.set(v.rifa_id, v.rifas.nome);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [pendingVendas]);

  const filteredFolhas = useMemo(() => {
    if (bingoFilterMatchId === 'todas') return folhasEmitidas;
    return folhasEmitidas.filter(f => f.match_id === bingoFilterMatchId);
  }, [folhasEmitidas, bingoFilterMatchId]);

  const reservasFiltradasStats = useMemo(() => {
    return minhasReservas.filter(r => {
      if (r.rifas?.status !== 'ativa') return false; 
      if (rifaFilterId !== 'todas' && r.rifa_id !== rifaFilterId) return false;
      return true;
    });
  }, [minhasReservas, rifaFilterId]);

  const reservasPorRifa = useMemo(() => {
    const map: Record<string, NumeroRifaVendedor[]> = {};
    for (const r of reservasFiltradasStats) {
      if (!map[r.rifa_id]) map[r.rifa_id] = [];
      map[r.rifa_id].push(r);
    }
    return map;
  }, [reservasFiltradasStats]);

  const filteredPendingFolhas = useMemo(() => {
    if (acertoBingoFilterId === 'todas') return pendingFolhas;
    return pendingFolhas.filter(f => f.match_id === acertoBingoFilterId);
  }, [pendingFolhas, acertoBingoFilterId]);

  const filteredPendingVendas = useMemo(() => {
    if (acertoRifaFilterId === 'todas') return pendingVendas;
    return pendingVendas.filter(v => v.rifa_id === acertoRifaFilterId);
  }, [pendingVendas, acertoRifaFilterId]);

  const allFilteredSelected = filteredFolhas.length > 0 && filteredFolhas.every(f => selectedFolhas.has(f.id));

  const isAllFilteredAcertosSelected = () => {
    const bingoIds = acertoTipoFilter !== 'rifa' ? filteredPendingFolhas.map(f => f.id) : [];
    const rifaIds = acertoTipoFilter !== 'bingo' ? filteredPendingVendas.map(v => v.id) : [];
    if (bingoIds.length === 0 && rifaIds.length === 0) return false;
    return bingoIds.every(id => selectedAcertosBingo.has(id)) && rifaIds.every(id => selectedAcertosRifa.has(id));
  };

  const handleSelectAllAcertos = () => {
    const bingoIds = acertoTipoFilter !== 'rifa' ? filteredPendingFolhas.map(f => f.id) : [];
    const rifaIds = acertoTipoFilter !== 'bingo' ? filteredPendingVendas.map(v => v.id) : [];
    
    if (isAllFilteredAcertosSelected()) {
        const nextBingo = new Set(selectedAcertosBingo);
        bingoIds.forEach(id => nextBingo.delete(id));
        setSelectedAcertosBingo(nextBingo);

        const nextRifa = new Set(selectedAcertosRifa);
        rifaIds.forEach(id => nextRifa.delete(id));
        setSelectedAcertosRifa(nextRifa);
    } else {
        const nextBingo = new Set(selectedAcertosBingo);
        bingoIds.forEach(id => nextBingo.add(id));
        setSelectedAcertosBingo(nextBingo);

        const nextRifa = new Set(selectedAcertosRifa);
        rifaIds.forEach(id => nextRifa.add(id));
        setSelectedAcertosRifa(nextRifa);
    }
  };

  const selectedFaturas = useMemo(() => {
    const folhas = pendingFolhas.filter(f => selectedAcertosBingo.has(f.id));
    const rifasCompradas = pendingVendas.filter(v => selectedAcertosRifa.has(v.id));
    
    let brutoGeral = 0;
    folhas.forEach(f => brutoGeral += Number(f.valor_pago));
    rifasCompradas.forEach(r => brutoGeral += Number(r.valor_total));
    
    return {
      bingo: { items: folhas },
      rifa: { items: rifasCompradas },
      geral: { bruto: brutoGeral }
    };
  }, [pendingFolhas, pendingVendas, selectedAcertosBingo, selectedAcertosRifa]);

  const toggleAcertoBingo = (id: string) => {
    setSelectedAcertosBingo(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAcertoRifa = (id: string) => {
    setSelectedAcertosRifa(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const comprasPendentesRelacionadas = useMemo(() => {
    const comprasMap = new Map();
    validarNumeros.forEach(n => {
      const cartela = n.cartelas_rifa?.[0];
      if (cartela?.compras_rifa?.status === 'pendente') {
        comprasMap.set(cartela.compra_id, cartela.compras_rifa.valor_total);
      }
    });
    let total = 0;
    const ids: string[] = [];
    comprasMap.forEach((valor, id) => {
      total += Number(valor);
      ids.push(id);
    });
    return { ids, total };
  }, [validarNumeros]);

  const toggleReservar = (numero: number) => {
    setReservarSelecionados(prev => prev.includes(numero) ? prev.filter(n => n !== numero) : [...prev, numero]);
  };

  const handleReservar = async () => {
    if (!reservarRifaId || reservarSelecionados.length === 0) return;
    setIsReservando(true);
    const ok = await reservarNumeros(reservarRifaId, reservarSelecionados, reservarFiado);
    setIsReservando(false);
    if (ok) {
      setReservarOpen(false);
      setReservarRifaId('');
      setReservarSelecionados([]);
      setReservarFiado(false);
    }
  };

  const toggleValidar = (id: string) => {
    const next = new Set(selectedToValidate);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedToValidate(next);
  };

  const handleValidarMultiplos = async () => {
    if (validarNumeros.length === 0 || !validarForm.nome.trim()) return;
    setIsValidando(true);
    const idsToValidate = validarNumeros.map(n => n.id);
    const ok = await validarMultiplasVendas(idsToValidate, validarForm.nome, validarForm.telefone, validarForm.endereco);
    setIsValidando(false);
    if (ok) {
      setValidarOpen(false);
      setSelectedToValidate(new Set()); 
      setModoSelecao(false);
    }
  };

  const handleValidarEPagar = async () => {
    if (comprasPendentesRelacionadas.ids.length === 0) return;
    setIsPagando(true);
    
    const pago = await pagarComprasComSaldo(comprasPendentesRelacionadas.ids);
    if (!pago) {
        setIsPagando(false);
        return;
    }

    if (validarForm.nome.trim()) {
        const idsToValidate = validarNumeros.map(n => n.id);
        await validarMultiplasVendas(idsToValidate, validarForm.nome, validarForm.telefone, validarForm.endereco);
    }
    
    setIsPagando(false);
    setValidarOpen(false);
    setSelectedToValidate(new Set());
    setModoSelecao(false);
  };

  const handleSaveDetalhes = async () => {
    if (!detalhesNumero) return;
    setIsSavingDetalhes(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('update-buyer', {
        body: {
          numero_id: detalhesNumero.id,
          nome: editDetalhesForm.nome,
          telefone: editDetalhesForm.telefone,
          endereco: editDetalhesForm.endereco
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Erro ao atualizar dados.');
      }

      toast.success('Dados atualizados com sucesso!');
      setDetalhesNumero({
        ...detalhesNumero,
        nome_comprador: editDetalhesForm.nome,
        telefone_comprador: editDetalhesForm.telefone,
        endereco_comprador: editDetalhesForm.endereco
      });
      setIsEditingDetalhes(false);
      queryClient.invalidateQueries({ queryKey: ['minhasReservasVendedor'] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSavingDetalhes(false);
    }
  };

  const handleGerarFolhasBingo = async () => {
    if (!selectedBingoMatch || qtdFolhasBingo < 1) return;
    setIsGerandoFolhas(true);
    const gridsPorFolha = gameSettings?.cartelas_por_folha_bingo || 4;
    const ok = await comprarFolhasBingo(selectedBingoMatch, qtdFolhasBingo, gridsPorFolha, bingoFiado);
    setIsGerandoFolhas(false);
    if (ok) {
      setComprarBingoOpen(false);
      setSelectedBingoMatch('');
      setQtdFolhasBingo(1);
      setBingoFiado(false);
    }
  };

  const handleEnviarAcerto = async () => {
    if (!acertoFile || selectedFaturas.geral.bruto <= 0) return;
    setIsEnviandoAcerto(true);
    const bingoIds = selectedFaturas.bingo.items.map(f => f.id);
    const rifaIds = selectedFaturas.rifa.items.map(r => r.id);
    const ok = await enviarAcerto(bingoIds, rifaIds, selectedFaturas.geral.bruto, acertoFile);
    setIsEnviandoAcerto(false);
    if (ok) {
      setPagarAcertoOpen(false);
      setAcertoFile(null);
      setSelectedAcertosBingo(new Set());
      setSelectedAcertosRifa(new Set());
    }
  };

  const handlePagarComSaldo = async () => {
    setIsPagandoComSaldo(true);
    const bingoIds = selectedFaturas.bingo.items.map(f => f.id);
    const rifaIds = selectedFaturas.rifa.items.map(r => r.id);
    const ok = await pagarAcertoComSaldo(bingoIds, rifaIds);
    setIsPagandoComSaldo(false);
    if (ok) {
        setPagarComSaldoOpen(false);
        setSelectedAcertosBingo(new Set());
        setSelectedAcertosRifa(new Set());
    }
  };

  const handleSelectAllFolhas = (checked: boolean) => {
    const newSet = new Set(selectedFolhas);
    if (checked) {
      filteredFolhas.forEach(f => newSet.add(f.id));
    } else {
      filteredFolhas.forEach(f => newSet.delete(f.id));
    }
    setSelectedFolhas(newSet);
  };

  const handleSelectFolha = (id: string, checked: boolean) => {
    const newSet = new Set(selectedFolhas);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedFolhas(newSet);
  };

  const handlePrintSelected = () => {
    if (selectedFolhas.size === 0) return;
    const idsString = Array.from(selectedFolhas).join(',');
    navigate(`/vendedor/imprimir-bingo/${idsString}`);
  };

  const scrollToAcertos = () => {
    setActiveTab('acertos');
    setTimeout(() => {
      const element = document.getElementById('secao-acertos');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const gerarLinkBase = (path: string) => {
    const base = window.location.origin;
    const ref = meuVendedor?.codigo_ref ?? '';
    return `${base}${path}?ref=${ref}`;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  }

  if (!meuVendedor) {
    return (
      <div className="card-container text-center py-16 space-y-4 max-w-md mx-auto">
        <UserCheck className="w-12 h-12 text-muted-foreground/40 mx-auto" />
        <p className="text-muted-foreground">Você não está cadastrado como vendedor ativo.</p>
      </div>
    );
  }

  const showBingoSection = acertoTipoFilter !== 'rifa' && filteredPendingFolhas.length > 0;
  const showRifaSection = acertoTipoFilter !== 'bingo' && filteredPendingVendas.length > 0;
  const saldoSuficiente = (profile?.credits || 0) >= selectedFaturas.geral.bruto;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-xl font-bold">Painel do Vendedor</h1>
            <p className="text-sm text-muted-foreground">{meuVendedor.nome}</p>
          </div>
        </div>
        <div className="flex flex-col items-end">
           <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">Ativo</Badge>
           <span className="text-[10px] text-muted-foreground mt-1 font-semibold">{comissaoAtiva}% Comissão a Receber</span>
        </div>
      </div>

      {pendentesTotais > 0 && (
        <div className="card-container bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3 text-red-700 dark:text-red-400">
            <DollarSign className="w-8 h-8 shrink-0" />
            <div>
              <h3 className="font-bold text-lg leading-tight">Você possui Itens no Fiado</h3>
              <p className="text-xs font-medium">Faça o Acerto financeiro pagando o valor integral da cartela. A sua comissão será creditada na sua conta logo em seguida!</p>
            </div>
          </div>
          <Button variant="destructive" className="shrink-0 w-full sm:w-auto font-bold" onClick={scrollToAcertos}>
            Fazer Acerto
          </Button>
        </div>
      )}

      <div className="card-container space-y-3">
        <h3 className="font-heading font-bold text-sm flex items-center gap-2"><Link2 className="w-4 h-4 text-primary" /> Seus Links de Indicação (Ganhe Comissão!)</h3>
        <p className="text-xs text-muted-foreground mb-2">Envie estes links para seus clientes. Se eles comprarem online, você ganha <strong>{gameSettings?.comissao_vendedor_global || 0}%</strong> de comissão no saldo!</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 p-2 bg-muted rounded-lg">
            <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase font-bold text-primary block mb-0.5">Link para Vender Bingo Online</span>
                <span className="text-xs font-mono text-muted-foreground truncate block">{gerarLinkBase('/')}</span>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 h-8 text-xs" onClick={() => { navigator.clipboard.writeText(gerarLinkBase('/')); toast.success('Copiado!'); }}><Copy className="w-3 h-3 mr-1" /> Copiar</Button>
          </div>
          <div className="flex items-center justify-between gap-2 p-2 bg-muted rounded-lg">
            <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase font-bold text-blue-600 block mb-0.5">Link para Vender Rifas Online</span>
                <span className="text-xs font-mono text-muted-foreground truncate block">{gerarLinkBase('/rifas')}</span>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 h-8 text-xs" onClick={() => { navigator.clipboard.writeText(gerarLinkBase('/rifas')); toast.success('Copiado!'); }}><Copy className="w-3 h-3 mr-1" /> Copiar</Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
        <TabsList className="grid w-full grid-cols-3 h-12 bg-muted/50 p-1 mb-4">
          <TabsTrigger value="rifas" className="flex items-center gap-2"><Ticket className="w-4 h-4" /> Rifas</TabsTrigger>
          <TabsTrigger value="bingo" className="flex items-center gap-2"><Grid3X3 className="w-4 h-4" /> Bingo Físico</TabsTrigger>
          <TabsTrigger value="acertos" className="flex items-center gap-2 relative">
            <Wallet className="w-4 h-4" /> Acertos
            {pendentesTotais > 0 && <span className="absolute top-1 right-1 flex h-2.5 w-2.5 rounded-full bg-destructive" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rifas" className="space-y-6 mt-0">
          <div className="grid grid-cols-3 gap-3">
             <div className="card-container p-3 text-center border-2 border-primary/20">
                 <p className="text-[10px] text-muted-foreground">Reservados (Total)</p>
                 <p className="text-xl font-bold font-heading text-primary">{reservasFiltradasStats.length}</p>
             </div>
             <div className="card-container p-3 text-center border-2 border-green-500/20">
                 <p className="text-[10px] text-muted-foreground">Validados</p>
                 <p className="text-xl font-bold font-heading text-green-600">{reservasFiltradasStats.filter(n => (n.status === 'vendido' || n.cartelas_rifa?.[0]?.compras_rifa?.status === 'pago') && !!n.nome_comprador?.trim()).length}</p>
             </div>
             <div className="card-container p-3 text-center border-2 border-amber-500/20">
                 <p className="text-[10px] text-muted-foreground">Pendentes</p>
                 <p className="text-xl font-bold font-heading text-amber-600">{reservasFiltradasStats.filter(n => !((n.status === 'vendido' || n.cartelas_rifa?.[0]?.compras_rifa?.status === 'pago') && !!n.nome_comprador?.trim())).length}</p>
             </div>
          </div>

          <div className="card-container p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="font-heading font-bold text-lg">Suas Reservas de Rifa</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 mr-2">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                    <Select value={rifaFilterId} onValueChange={setRifaFilterId}>
                      <SelectTrigger className="h-8 w-[140px] sm:w-[180px] text-xs">
                        <SelectValue placeholder="Todas as rifas ativas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as rifas ativas</SelectItem>
                        {uniqueRifasReservadas.map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant={modoSelecao ? "secondary" : "outline"} size="sm" onClick={() => {
                      setModoSelecao(!modoSelecao);
                      setSelectedToValidate(new Set());
                  }}>
                      {modoSelecao ? 'Cancelar Seleção' : <><ListChecks className="w-4 h-4 mr-1.5" /> Selecionar Vários</>}
                  </Button>
                  <Button className="gradient-primary" size="sm" onClick={() => setReservarOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" /> Nova Reserva
                  </Button>
                </div>
              </div>

              {modoSelecao && selectedToValidate.size > 0 && (
                <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                   <span className="text-sm font-bold text-primary">{selectedToValidate.size} números selecionados</span>
                   <div className="flex gap-2">
                     <Button size="sm" variant="outline" className="border-primary text-primary hover:bg-primary/20" onClick={() => {
                        const idsString = Array.from(selectedToValidate).join(',');
                        navigate(`/vendedor/imprimir/todas?numeros=${idsString}`);
                     }}>
                        <Printer className="w-4 h-4 mr-1.5" /> Imprimir
                     </Button>
                     <Button size="sm" onClick={() => {
                        const nums = minhasReservas.filter(n => selectedToValidate.has(n.id));
                        setValidarNumeros(nums);
                        setValidarForm({ nome: '', telefone: '', endereco: '' });
                        setValidarOpen(true);
                     }}>
                        Validar
                     </Button>
                   </div>
                </div>
              )}

              {Object.keys(reservasPorRifa).length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" /> Nenhuma reserva ativa para a seleção atual.
                </div>
              ) : (
                Object.entries(reservasPorRifa).map(([rifaId, numeros]) => (
                    <div key={rifaId} className="space-y-3 bg-muted/30 p-3 rounded-lg border border-border/50">
                      <div className="flex items-center justify-between">
                        <h4 className="font-heading font-bold text-sm">{numeros[0]?.rifas?.nome ?? 'Rifa'}</h4>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/vendedor/imprimir/${rifaId}`)}>
                          <Printer className="w-3 h-3 mr-1" /> Imprimir Pendentes
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                        {numeros.map(n => {
                          const isSelected = selectedToValidate.has(n.id);
                          const statusCompra = n.cartelas_rifa?.[0]?.compras_rifa?.status;
                          
                          const temNome = !!n.nome_comprador?.trim();
                          const numeroEstaPago = statusCompra === 'pago' || n.status === 'vendido';
                          
                          const isTotalmenteFinalizado = numeroEstaPago && temNome;
                          const isPagoSemNome = numeroEstaPago && !temNome;

                          let badgeText = 'PAGO';
                          let badgeClass = 'text-green-700 bg-green-100';

                          if (statusCompra === 'pendente') {
                            badgeText = 'FIADO';
                            badgeClass = 'text-red-700 bg-red-100';
                          } else if (statusCompra === 'em_analise') {
                            badgeText = 'ANÁLISE';
                            badgeClass = 'text-amber-700 bg-amber-100';
                          }

                          return (
                            <div key={n.id} className="relative group">
                                <button
                                    onClick={() => {
                                        if (modoSelecao) {
                                            toggleValidar(n.id);
                                            return;
                                        }
                                        if (isTotalmenteFinalizado) {
                                            setDetalhesNumero(n);
                                            setEditDetalhesForm({ 
                                                nome: n.nome_comprador || '', 
                                                telefone: n.telefone_comprador || '', 
                                                endereco: n.endereco_comprador || '' 
                                            });
                                            setIsEditingDetalhes(false);
                                            return;
                                        }
                                        setValidarNumeros([n]);
                                        setValidarForm({ nome: n.nome_comprador || '', telefone: n.telefone_comprador || '', endereco: n.endereco_comprador || '' });
                                        setValidarOpen(true);
                                    }}
                                    className={`w-full rounded-lg p-2 flex flex-col items-center justify-center gap-0.5 transition-all min-h-[85px] border 
                                        ${isTotalmenteFinalizado ? 'bg-green-50/50 text-green-700 border-green-200 opacity-90' : 
                                          isPagoSemNome ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 cursor-pointer shadow-sm' :
                                          'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 cursor-pointer'}
                                        ${modoSelecao && isSelected ? 'ring-2 ring-primary border-primary bg-primary/10 text-primary' : ''}
                                    `}
                                >
                                    {isTotalmenteFinalizado && (
                                        <div className="absolute top-1 left-1.5 flex flex-col items-center">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                        </div>
                                    )}

                                    <span className={`text-2xl font-black font-heading leading-none ${isPagoSemNome ? 'text-blue-700' : ''}`}>{n.numero}</span>
                                    
                                    {isPagoSemNome && (
                                        <p className="text-[6px] font-black leading-tight text-center px-1 mt-1 animate-pulse uppercase text-blue-600">
                                            Informe o cliente
                                        </p>
                                    )}

                                    {isTotalmenteFinalizado ? (
                                        <span className="text-[7px] text-green-700/70 font-bold uppercase mt-1">
                                            {n.cartelas_rifa?.[0]?.compras_rifa?.tipo_pagamento === 'creditos' ? 'Online' : 'Físico'}
                                        </span>
                                    ) : !isPagoSemNome ? (
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded border mt-1.5 uppercase font-black tracking-wider w-full text-center border-transparent ${badgeClass}`}>
                                          {badgeText}
                                        </span>
                                    ) : null}
                                </button>
                                {n.status === 'reservado' && !numeroEstaPago && !modoSelecao && (
                                    <button onClick={e => { e.stopPropagation(); setCancelarNumero(n); }} className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors z-10">
                                        <Undo2 className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                ))
              )}
          </div>
        </TabsContent>

        <TabsContent value="bingo" className="space-y-4 mt-0">
          <div className="grid grid-cols-3 gap-3">
             <div className="card-container p-3 text-center border-2 border-purple-500/20"><p className="text-[10px] text-muted-foreground">Folhas Emitidas</p><p className="text-xl font-bold font-heading text-purple-600">{filteredFolhas.length}</p></div>
             <div className="card-container p-3 text-center border-2 border-primary/20"><p className="text-[10px] text-muted-foreground">Cartelas (Grids)</p><p className="text-xl font-bold font-heading text-primary">{filteredFolhas.reduce((a,f) => a + (f.grids?.length || 0), 0)}</p></div>
             <div className="card-container p-3 text-center border-2 border-green-500/20"><p className="text-[10px] text-muted-foreground">Pago</p><p className="text-lg font-bold font-heading text-green-600">R$ {filteredFolhas.filter(f=>f.status==='pago').reduce((a,f)=>a+Number(f.valor_pago),0).toFixed(2)}</p></div>
          </div>

          <div className="card-container p-0 overflow-hidden">
            <div className="p-4 border-b bg-purple-50/50 dark:bg-purple-900/10 flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-purple-900 dark:text-purple-300">Venda de Bingo Físico</h3>
                <p className="text-xs text-muted-foreground">Emita cartelas de papel e venda presencialmente.</p>
              </div>
              <Button className="bg-purple-600 hover:bg-purple-700 text-white font-bold" onClick={() => setComprarBingoOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Gerar Folhas
              </Button>
            </div>

            <div className="p-3 border-b bg-muted/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="select-all" 
                  checked={allFilteredSelected}
                  onCheckedChange={handleSelectAllFolhas}
                />
                <Label htmlFor="select-all" className="text-sm cursor-pointer">Selecionar Visíveis</Label>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Label className="text-xs text-muted-foreground whitespace-nowrap"><Filter className="w-3 h-3 inline mr-1" />Filtrar Partida:</Label>
                <Select value={bingoFilterMatchId} onValueChange={setBingoFilterMatchId}>
                  <SelectTrigger className="h-8 w-full sm:w-[200px]">
                    <SelectValue placeholder="Todas as partidas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as partidas</SelectItem>
                    {uniqueBingoMatches.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedFolhas.size > 0 && (
                <Button size="sm" variant="secondary" onClick={handlePrintSelected} className="border-purple-300 text-purple-700 hover:bg-purple-100 w-full sm:w-auto">
                  <Printer className="w-4 h-4 mr-1.5" /> Imprimir ({selectedFolhas.size})
                </Button>
              )}
            </div>

            <div className="divide-y max-h-[400px] overflow-y-auto">
              {filteredFolhas.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma folha gerada para esta seleção.</div>
              ) : (
                filteredFolhas.map(folha => (
                  <div key={folha.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Checkbox 
                        checked={selectedFolhas.has(folha.id)}
                        onCheckedChange={(checked) => handleSelectFolha(folha.id, !!checked)}
                      />
                      <div>
                        <p className="font-bold text-sm">{folha.partidas?.name || 'Partida'}</p>
                        <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground mt-1 items-center">
                          <span className="font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">Cod: {folha.codigo_validacao}</span>
                          <span>{format(new Date(folha.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                          <Badge variant="outline" className={`h-4 ${folha.status === 'pendente' ? 'text-destructive border-destructive bg-destructive/10 font-bold' : folha.status === 'em_analise' ? 'text-amber-500 border-amber-500' : 'text-success border-success bg-success/10 font-bold'}`}>
                            {folha.status === 'pendente' ? 'FIADO' : folha.status === 'em_analise' ? 'EM ANÁLISE' : 'PAGO'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 ml-2" onClick={() => navigate(`/vendedor/imprimir-bingo/${folha.id}`)}>
                      <Printer className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Imprimir</span>
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="acertos" className="space-y-4 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <div className="card-container p-4 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
               <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-1">
                  <HeartHandshake className="w-4 h-4" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Comissões Recebidas</p>
               </div>
               <p className="text-2xl font-black font-heading text-green-800 dark:text-green-300">R$ {comissoesGanhas.toFixed(2).replace('.', ',')}</p>
               <p className="text-[9px] text-green-700/70 leading-tight mt-1">Acertos fechados e validados pelo Admin.</p>
            </div>
            <div className="card-container p-4 bg-destructive/5 border-destructive/20">
               <div className="flex items-center gap-2 text-destructive mb-1">
                  <BadgeDollarSign className="w-4 h-4" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Fiado na Rua (A Pagar)</p>
               </div>
               <p className="text-2xl font-black font-heading text-destructive">R$ {dividaAtual.toFixed(2).replace('.', ',')}</p>
            </div>
          </div>

          <div className="card-container space-y-4">
            <div className="flex items-center justify-between mb-2 border-b pb-4">
                <h2 id="secao-acertos" className="font-heading text-lg font-bold flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" /> Fazer Novo Acerto
                </h2>
                {selectedFaturas.geral.bruto > 0 && (
                    <Button className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm font-bold animate-pulse hidden sm:flex" onClick={() => setPagarAcertoOpen(true)}>
                        Pagar R$ {selectedFaturas.geral.bruto.toFixed(2)}
                    </Button>
                )}
            </div>
            
            {pendentesTotais === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-success/30 rounded-xl bg-success/5">
                <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-2" />
                <p className="font-bold text-success">Tudo em dia!</p>
                <p className="text-sm text-muted-foreground mt-1">Você não possui cartelas pendentes de repasse.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-muted/30 p-2 rounded-lg border border-border/50 gap-3">
                  <p className="text-xs font-semibold text-muted-foreground ml-2 whitespace-nowrap">Filtre para facilitar o acerto:</p>
                  
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <Select value={acertoTipoFilter} onValueChange={(v: any) => setAcertoTipoFilter(v)}>
                      <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos (Bingo+Rifa)</SelectItem>
                        <SelectItem value="bingo">Somente Bingos</SelectItem>
                        <SelectItem value="rifa">Somente Rifas</SelectItem>
                      </SelectContent>
                    </Select>

                    {acertoTipoFilter !== 'rifa' && (
                      <Select value={acertoBingoFilterId} onValueChange={setAcertoBingoFilterId}>
                        <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
                          <SelectValue placeholder="Todos os Bingos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todos os Bingos</SelectItem>
                          {uniquePendingBingoMatches.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    
                    {acertoTipoFilter !== 'bingo' && (
                      <Select value={acertoRifaFilterId} onValueChange={setAcertoRifaFilterId}>
                        <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
                          <SelectValue placeholder="Todas as Rifas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todas as Rifas</SelectItem>
                          {uniquePendingRifas.map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <Button variant="outline" size="sm" onClick={handleSelectAllAcertos} className="w-full sm:w-auto">
                       {isAllFilteredAcertosSelected() ? 'Limpar Visíveis' : 'Selecionar Visíveis'}
                    </Button>
                  </div>
                </div>

                {showBingoSection && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">Bingo Físico</p>
                    {filteredPendingFolhas.map(f => (
                      <div 
                        key={f.id} 
                        className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${selectedAcertosBingo.has(f.id) ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/10' : 'border-transparent bg-card hover:bg-muted/50 shadow-sm'}`} 
                        onClick={() => toggleAcertoBingo(f.id)}
                      >
                        <Checkbox checked={selectedAcertosBingo.has(f.id)} className={selectedAcertosBingo.has(f.id) ? "border-purple-600 data-[state=checked]:bg-purple-600" : ""} />
                        <div className="flex-1">
                          <p className="text-sm font-bold">{f.partidas?.name}</p>
                          <p className="text-[11px] text-purple-600 dark:text-purple-400 font-mono mt-0.5">Cod: {f.codigo_validacao}</p>
                        </div>
                        <p className="font-black text-purple-700 dark:text-purple-400">R$ {Number(f.valor_pago).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {showRifaSection && (
                  <div className="space-y-2 mt-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Rifas</p>
                    {filteredPendingVendas.map(v => (
                      <div 
                        key={v.id} 
                        className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${selectedAcertosRifa.has(v.id) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'border-transparent bg-card hover:bg-muted/50 shadow-sm'}`} 
                        onClick={() => toggleAcertoRifa(v.id)}
                      >
                        <Checkbox checked={selectedAcertosRifa.has(v.id)} className={selectedAcertosRifa.has(v.id) ? "border-blue-600 data-[state=checked]:bg-blue-600" : ""} />
                        <div className="flex-1">
                          <p className="text-sm font-bold truncate max-w-[200px]">{v.rifas?.nome}</p>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <p className="text-xs font-mono text-muted-foreground">Cotas: {v.numeros.join(', ')}</p>
                            {v.cartelas_rifa?.length > 0 && (
                              <p className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                                Cods: {v.cartelas_rifa.map((c:any) => c.codigo_validacao).join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <p className="font-black text-blue-700 dark:text-blue-400">R$ {Number(v.valor_total).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
                
                {!showBingoSection && !showRifaSection && pendentesTotais > 0 && (
                  <div className="p-6 text-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                    Nenhum item pendente para a seleção atual dos filtros.
                  </div>
                )}
                
                {selectedFaturas.geral.bruto > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-amber-100 dark:bg-amber-900/20 border-2 border-amber-400 rounded-xl mt-6 gap-4">
                      <div className="text-center sm:text-left">
                          <p className="text-sm font-bold text-amber-800 dark:text-amber-500 uppercase tracking-widest flex items-center justify-center sm:justify-start gap-2">
                              <BadgePercent className="w-5 h-5" /> REPASSE SELECIONADO
                          </p>
                          <p className="text-xs text-amber-700/80 mt-1">Ao quitar este valor (bruto), você receberá <strong>{comissaoAtiva}%</strong> de comissão no saldo do App.</p>
                      </div>
                      <div className="flex flex-col items-center sm:items-end gap-2 w-full sm:w-auto">
                          <p className="text-3xl font-black font-heading text-amber-700 dark:text-amber-400">R$ {selectedFaturas.geral.bruto.toFixed(2).replace('.', ',')}</p>
                          <div className="flex flex-col sm:flex-row gap-2 w-full">
                              <Button 
                                  className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm font-bold" 
                                  onClick={() => setPagarAcertoOpen(true)}
                              >
                                  Pagar com PIX
                              </Button>
                              <Button 
                                  variant="outline"
                                  className="border-primary/30 text-primary hover:bg-primary/10 font-bold"
                                  onClick={() => setPagarComSaldoOpen(true)}
                                  disabled={!saldoSuficiente}
                                  title={!saldoSuficiente ? `Saldo insuficiente. Você tem ${profile?.credits.toFixed(2)} cr.` : `Pagar com seu saldo de ${profile?.credits.toFixed(2)} cr.`}
                              >
                                  <WalletCards className="w-4 h-4 mr-2" />
                                  Pagar com Saldo
                              </Button>
                          </div>
                      </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 border-t pt-6">
              <h3 className="font-heading font-bold text-sm mb-3">Seu Histórico de Acertos (PIX)</h3>
              <div className="space-y-4">
                {meusAcertos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum acerto enviado ainda.</p>
                ) : (
                  meusAcertos.map((acerto: any) => {
                    const isBugged = acerto.status === 'aprovar' || acerto.status === 'rejeitar';
                    const finalStatus = isBugged ? (acerto.status === 'aprovar' ? 'aprovado' : 'rejeitado') : acerto.status;
                    const comissao = Number(acerto.comissao_paga || 0);

                    return (
                      <div key={acerto.id} className="p-4 border rounded-xl flex flex-col text-sm bg-muted/20 gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Valor Transferido (Bruto)</p>
                            <p className="font-black text-lg text-primary">R$ {Number(acerto.valor).toFixed(2).replace('.', ',')}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(acerto.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                          </div>
                          <div className="text-right">
                              <Badge variant={finalStatus === 'aprovado' ? 'default' : finalStatus === 'rejeitado' ? 'destructive' : 'secondary'} className={finalStatus === 'aprovado' ? 'bg-success text-white' : ''}>
                                {finalStatus.toUpperCase()}
                              </Badge>
                              {finalStatus === 'aprovado' && comissao > 0 && (
                                <p className="text-[10px] font-bold text-amber-600 mt-1">
                                    + R$ {comissao.toFixed(2)} de comissão.
                                </p>
                              )}
                          </div>
                        </div>

                        {isBugged && (
                          <div className="text-[10px] bg-amber-100 text-amber-800 p-2 rounded border border-amber-300 mb-1 font-semibold flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3" /> Falha no processamento. O Admin precisa corrigir este item no painel.
                          </div>
                        )}
                        
                        <div className="pt-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Itens Inclusos neste repasse</p>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                             {acerto.bingo_ids && acerto.bingo_ids.map((bId: string) => {
                                const folha = folhasEmitidas.find(f => f.id === bId);
                                return (
                                    <div key={bId} className="flex justify-between items-center text-xs bg-background p-2 rounded-lg border">
                                        <span className="flex items-center gap-1.5 text-muted-foreground"><Grid3X3 className="w-3.5 h-3.5" /> {folha?.partidas?.name || 'Bingo Físico'}</span>
                                        <span className="font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded shadow-sm border border-primary/20">{folha ? folha.codigo_validacao : '...'+bId.slice(-6)}</span>
                                    </div>
                                );
                             })}
                             {acerto.rifa_ids && acerto.rifa_ids.map((rId: string) => {
                                const venda = minhasVendas.find(v => v.id === rId);
                                const codigos = venda?.cartelas_rifa?.map((c:any) => c.codigo_validacao).join(', ');
                                return (
                                    <div key={rId} className="flex flex-col gap-1.5 text-xs bg-background p-2.5 rounded-lg border">
                                        <div className="flex justify-between items-center">
                                          <span className="flex items-center gap-1.5 text-muted-foreground font-medium"><Ticket className="w-3.5 h-3.5" /> Rifa ({venda?.rifas?.nome || '...'})</span>
                                          <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded border text-[10px]">Cotas: {venda ? venda.numeros.join(', ') : '...'+rId.slice(-6)}</span>
                                        </div>
                                        {codigos && (
                                            <div className="text-[10px] text-primary font-mono mt-1 border-t pt-1.5 border-dashed font-bold tracking-widest">
                                                Cods: {codigos}
                                            </div>
                                        )}
                                    </div>
                                );
                             })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detalhesNumero} onOpenChange={(open) => !open && setDetalhesNumero(null)}>
        <DialogContent>
          <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Ticket className="w-5 h-5 text-primary" />
               Detalhes da Cota {detalhesNumero?.numero}
             </DialogTitle>
          </DialogHeader>
          {detalhesNumero && (
             <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Status</p>
                        <Badge className="bg-success text-white border-none mt-0.5">PAGO E HABILITADO</Badge>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Código</p>
                        <p className="font-mono font-bold text-primary">{detalhesNumero.cartelas_rifa?.[0]?.codigo_validacao}</p>
                    </div>
                </div>

                <div className="space-y-3 border-t pt-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                            <User className="w-4 h-4 text-muted-foreground" /> Dados do Comprador
                        </h3>
                        {!isEditingDetalhes && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setIsEditingDetalhes(true)}>
                                <Edit className="w-3.5 h-3.5 mr-1.5" /> Editar
                            </Button>
                        )}
                    </div>
                    
                    {isEditingDetalhes ? (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Nome Completo</Label>
                                <Input value={editDetalhesForm.nome} onChange={e => setEditDetalhesForm(p => ({...p, nome: e.target.value}))} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">WhatsApp</Label>
                                    <Input value={editDetalhesForm.telefone} onChange={e => setEditDetalhesForm(p => ({...p, telefone: e.target.value}))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Endereço</Label>
                                    <Input value={editDetalhesForm.endereco} onChange={e => setEditDetalhesForm(p => ({...p, endereco: e.target.value}))} />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button variant="outline" size="sm" className="flex-1" onClick={() => setIsEditingDetalhes(false)} disabled={isSavingDetalhes}>Cancelar</Button>
                                <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={handleSaveDetalhes} disabled={isSavingDetalhes || !editDetalhesForm.nome.trim()}>
                                    {isSavingDetalhes ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Save className="w-3 h-3 mr-2" />} Salvar
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="col-span-2">
                                <p className="text-xs text-muted-foreground font-semibold">Nome</p>
                                <p className="font-medium">{detalhesNumero.nome_comprador}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-semibold">WhatsApp</p>
                                <p className="font-medium">{detalhesNumero.telefone_comprador || 'Não informado'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-semibold">Endereço</p>
                                <p className="font-medium">{detalhesNumero.endereco_comprador || 'Não informado'}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-3 border-t pt-3">
                    <h3 className="text-sm font-bold flex items-center gap-2 text-foreground"><WalletCards className="w-4 h-4 text-muted-foreground" /> Dados do Pagamento</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <p className="text-xs text-muted-foreground font-semibold">Origem do Pagamento</p>
                            <p className="font-medium capitalize">
                                {detalhesNumero.cartelas_rifa?.[0]?.compras_rifa?.tipo_pagamento === 'creditos' ? 'App Online' : 'Vendedor Físico'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground font-semibold">Valor da Cota</p>
                            <p className="font-medium">R$ {Number(detalhesNumero.rifas?.custo_por_numero || 0).toFixed(2)}</p>
                        </div>
                    </div>
                </div>
             </div>
          )}
          <DialogFooter className="flex justify-between sm:justify-between w-full">
             <Button variant="outline" onClick={() => navigate(`/vendedor/imprimir/todas?numeros=${detalhesNumero?.id}`)}>
               <Printer className="w-4 h-4 mr-2" /> Imprimir Bilhete
             </Button>
             <Button onClick={() => setDetalhesNumero(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={comprarBingoOpen} onOpenChange={setComprarBingoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Grid3X3 className="w-5 h-5 text-purple-600" />
              Emitir Folhas de Bingo
            </DialogTitle>
            <DialogDescription className="sr-only">Gerar novas cartelas de bingo físico.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label>Selecione a Partida Manual</Label>
              {manualMatches.length === 0 ? (
                <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">Não há partidas manuais abertas.</div>
              ) : (
                <Select value={selectedBingoMatch} onValueChange={setSelectedBingoMatch}>
                  <SelectTrigger><SelectValue placeholder="Escolha uma partida..." /></SelectTrigger>
                  <SelectContent>
                    {manualMatches.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name} — R$ {Number(m.card_price).toFixed(2)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedBingoMatch && (
              <div className="space-y-2">
                <Label>Quantidade de Folhas Físicas</Label>
                <Input type="number" min="1" value={qtdFolhasBingo} onChange={e => setQtdFolhasBingo(parseInt(e.target.value) || 1)} />
                <p className="text-[10px] text-muted-foreground">Cada folha terá <strong>{gameSettings?.cartelas_por_folha_bingo || 4} grids</strong>.</p>
              </div>
            )}

            {selectedBingoMatch && qtdFolhasBingo > 0 && (() => {
              const match = manualMatches.find(m => m.id === selectedBingoMatch);
              const precoBase = (match?.card_price || 0) * qtdFolhasBingo;
              const precoComDesconto = precoBase * (1 - (descontoAtivo / 100));

              return (
                <>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-1">
                    <div className="flex justify-between items-center font-bold text-lg text-purple-900">
                      <span>Valor da Compra:</span>
                      {bingoFiado ? (
                        <span>R$ {precoBase.toFixed(2)}</span>
                      ) : (
                        <div className="text-right flex flex-col items-end">
                           <span className="line-through text-[10px] text-muted-foreground mr-1 font-normal leading-none">R$ {precoBase.toFixed(2)}</span>
                           <span className="leading-tight">R$ {precoComDesconto.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-2 text-xs text-purple-700 font-medium">
                      {bingoFiado ? (
                        `* Você receberá ${comissaoAtiva}% de comissão na sua conta após realizar o acerto financeiro (PIX).`
                      ) : (
                        `* Você está recebendo ${descontoAtivo}% de desconto na compra à vista com seu saldo.`
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label className="text-sm font-bold">Gerar no Fiado</Label>
                      <p className="text-[10px] text-muted-foreground">Imprimir agora e repassar valor ao Admin depois.</p>
                    </div>
                    <Switch checked={bingoFiado} onCheckedChange={setBingoFiado} />
                  </div>
                </>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setComprarBingoOpen(false)}>Cancelar</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" disabled={isGerandoFolhas || !selectedBingoMatch || qtdFolhasBingo < 1} onClick={handleGerarFolhasBingo}>
              {isGerandoFolhas ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
              {bingoFiado ? 'Gerar Fiado' : 'Comprar e Gerar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reservarOpen} onOpenChange={setReservarOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Reserva de Números</DialogTitle>
            <DialogDescription className="sr-only">Escolha os números que quer reservar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Selecione a Rifa</Label>
              <Select value={reservarRifaId} onValueChange={(val) => { setReservarRifaId(val); setReservarSelecionados([]); }}>
                <SelectTrigger><SelectValue placeholder="Escolha uma rifa ativa" /></SelectTrigger>
                <SelectContent>
                  {rifasAtivas.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {reservarRifaId && (
              <div className="space-y-2">
                <Label>Números Disponíveis</Label>
                <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto p-2 border rounded-md">
                  {numerosDisponiveis.map(n => (
                    <button
                      key={n.id} disabled={n.status !== 'disponivel'}
                      onClick={() => n.status === 'disponivel' && toggleReservar(n.numero)}
                      className={`rounded p-1 text-xs font-semibold transition-colors ${reservarSelecionados.includes(n.numero) ? 'bg-primary text-primary-foreground' : n.status === 'disponivel' ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'}`}
                    >
                      {n.numero}
                    </button>
                  ))}
                </div>
                
                {reservarSelecionados.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-1">
                      {(() => { 
                        const rifa = rifasAtivas.find(r => r.id === reservarRifaId); 
                        const bruto = rifa ? reservarSelecionados.length * rifa.custo_por_numero : 0;
                        const precoComDesconto = bruto * (1 - (descontoAtivo / 100));
                        return (
                          <>
                            <div className="flex justify-between items-center font-bold text-lg text-primary mb-1">
                              <span>Valor da Compra:</span>
                              {reservarFiado ? (
                                <span>R$ {bruto.toFixed(2)}</span>
                              ) : (
                                <div className="text-right flex flex-col items-end">
                                   <span className="line-through text-[10px] text-muted-foreground mr-1 font-normal leading-none">R$ {bruto.toFixed(2)}</span>
                                   <span className="leading-tight">R$ {precoComDesconto.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                            <div className="pt-2 border-t border-primary/20 text-xs text-primary/80 font-medium">
                              {reservarFiado ? (
                                `* Você receberá ${comissaoAtiva}% de comissão na sua conta do App assim que o pagamento desta dívida for concluído.`
                              ) : (
                                `* Você está recebendo ${descontoAtivo}% de desconto nesta compra à vista com seu saldo.`
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="text-sm font-bold">Reservar Fiado</Label>
                        <p className="text-[10px] text-muted-foreground">Pagar valor ao Admin depois.</p>
                      </div>
                      <Switch checked={reservarFiado} onCheckedChange={setReservarFiado} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReservarOpen(false)}>Cancelar</Button>
            <Button className="gradient-primary" onClick={handleReservar} disabled={isReservando || !reservarRifaId || reservarSelecionados.length === 0}>
              {isReservando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pagarAcertoOpen} onOpenChange={setPagarAcertoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repassar Valor ao Sistema</DialogTitle>
            <DialogDescription>
              Faça o PIX para a chave do administrador e anexe o comprovante para validar o pagamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-4 bg-muted rounded-xl text-center space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Valor da transferência (Bruto):</p>
              <p className="text-4xl font-black font-heading text-primary">R$ {selectedFaturas.geral.bruto.toFixed(2).replace('.', ',')}</p>
              <p className="text-xs text-muted-foreground">Sua comissão será creditada automaticamente no saldo da sua conta após a aprovação!</p>
            </div>
            {gameSettings?.pix_key && (
              <div className="space-y-1">
                <Label>Chave PIX do Admin</Label>
                <div className="flex gap-2">
                  <Input value={gameSettings.pix_key} readOnly className="font-mono bg-muted font-bold" />
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText(gameSettings.pix_key || ''); toast.success('Copiado!'); }}><Copy className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Anexar Comprovante</Label>
              <input ref={acertoFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setAcertoFile(e.target.files?.[0] || null)} />
              <Button type="button" variant="outline" className="w-full h-12 border-dashed border-2" onClick={() => acertoFileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" /> {acertoFile ? acertoFile.name : 'Clique para selecionar arquivo'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPagarAcertoOpen(false)}>Cancelar</Button>
            <Button className="gradient-primary" onClick={handleEnviarAcerto} disabled={isEnviandoAcerto || !acertoFile || selectedFaturas.geral.bruto <= 0}>
              {isEnviandoAcerto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckSquare className="w-4 h-4 mr-2" />} Enviar para Análise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pagarComSaldoOpen} onOpenChange={setPagarComSaldoOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Pagar Acerto com Saldo</DialogTitle>
                <DialogDescription>
                    Confirme o pagamento do acerto utilizando seu saldo de créditos disponível.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                    Você está prestes a quitar o valor de <strong>R$ {selectedFaturas.geral.bruto.toFixed(2)}</strong> usando seu saldo de créditos.
                </p>
                <div className="p-3 bg-muted rounded-lg border text-center">
                    <p className="text-xs text-muted-foreground">Seu saldo atual</p>
                    <p className="text-lg font-bold">{profile?.credits.toFixed(2)} cr.</p>
                    <p className="text-xs text-destructive">- {selectedFaturas.geral.bruto.toFixed(2)} cr.</p>
                    <hr className="my-2" />
                    <p className="text-xs text-muted-foreground">Saldo após pagamento</p>
                    <p className="text-lg font-bold text-primary">{( (profile?.credits || 0) - selectedFaturas.geral.bruto ).toFixed(2)} cr.</p>
                </div>
                <p className="text-sm text-muted-foreground">
                    Após a confirmação, sua comissão de <strong>{comissaoAtiva}%</strong> (R$ {(selectedFaturas.geral.bruto * (comissaoAtiva / 100)).toFixed(2)}) será creditada de volta na sua conta.
                </p>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setPagarComSaldoOpen(false)}>Cancelar</Button>
                <Button 
                    onClick={handlePagarComSaldo} 
                    disabled={isPagandoComSaldo}
                    className="bg-primary text-primary-foreground"
                >
                    {isPagandoComSaldo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <WalletCards className="w-4 h-4 mr-2" />}
                    Confirmar Pagamento
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={validarOpen} onOpenChange={setValidarOpen}>
        <DialogContent>
          <DialogHeader>
             <DialogTitle>
                 Validar Venda - {validarNumeros.length > 1 ? `${validarNumeros.length} Números` : `Número ${validarNumeros[0]?.numero}`}
             </DialogTitle>
             <DialogDescription className="sr-only">Confirme os dados do comprador para os números selecionados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
             
             {comprasPendentesRelacionadas.ids.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg space-y-2">
                  <div className="flex gap-2 text-red-700 dark:text-red-400">
                     <AlertTriangle className="w-5 h-5 shrink-0" />
                     <div>
                       <p className="font-bold text-sm leading-tight">Atenção: Você tem cartelas no Fiado aqui!</p>
                       <p className="text-xs mt-1">Alguns destes números foram gerados no fiado (Total: <strong>R$ {comprasPendentesRelacionadas.total.toFixed(2)}</strong>). Para validá-los agora, esse valor será debitado do seu saldo e sua comissão será recebida na hora.</p>
                     </div>
                  </div>
                </div>
             )}

             {comprasPendentesRelacionadas.ids.length === 0 && (
                 <p className="text-sm text-muted-foreground">Preencha os dados do comprador. (A cartela já está Paga).</p>
             )}

             {validarNumeros.length > 1 && (
                 <div className="p-2 bg-muted rounded-lg text-xs font-bold font-mono break-words">
                     Cotas: {validarNumeros.map(n => n.numero).join(', ')}
                 </div>
             )}
             <div className="space-y-2">
                 <Label>Nome do Comprador (Obrigatório)</Label>
                 <Input value={validarForm.nome} onChange={e => setValidarForm(p => ({ ...p, nome: e.target.value }))} />
             </div>
             <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                     <Label>WhatsApp</Label>
                     <Input value={validarForm.telefone} onChange={e => setValidarForm(p => ({ ...p, telefone: e.target.value }))} />
                 </div>
                 <div className="space-y-2">
                     <Label>Endereço</Label>
                     <Input value={validarForm.endereco} onChange={e => setValidarForm(p => ({ ...p, endereco: e.target.value }))} />
                 </div>
             </div>
             
             <div className="flex flex-col gap-2 pt-2">
                {comprasPendentesRelacionadas.ids.length > 0 ? (
                    <Button 
                        className="bg-green-600 hover:bg-green-700 text-white w-full shadow-button h-12" 
                        onClick={handleValidarEPagar} 
                        disabled={isPagando || !validarForm.nome.trim()}
                    >
                        {isPagando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <WalletCards className="w-5 h-5 mr-2" />} 
                        <div className="text-left">
                            <span className="block font-bold">Pagar com Meu Saldo & Validar</span>
                            <span className="block text-[10px] opacity-80">Debitar R$ {comprasPendentesRelacionadas.total.toFixed(2)} dos meus créditos</span>
                        </div>
                    </Button>
                ) : (
                    <Button className="w-full gradient-primary" onClick={handleValidarMultiplos} disabled={isValidando || !validarForm.nome.trim()}>
                        {isValidando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckSquare className="h-4 w-4 mr-2" />} 
                        Confirmar Validação
                    </Button>
                )}
             </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelarNumero} onOpenChange={open => { if (!open) setCancelarNumero(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2"><Undo2 className="w-5 h-5" /> Cancelar Reserva</DialogTitle>
            <DialogDescription className="sr-only">Confirmar o cancelamento e devolução.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3"><p>Você tem certeza que deseja cancelar a reserva do número <strong>{cancelarNumero?.numero}</strong>?</p><p className="text-sm text-muted-foreground">O número voltará a ficar disponível e o valor será estornado (se você já tiver pago).</p></div>
          <DialogFooter><Button variant="ghost" onClick={() => setCancelarNumero(null)} disabled={isCancelando}>Voltar</Button><Button variant="destructive" onClick={async () => { if (!cancelarNumero) return; setIsCancelando(true); const ok = await cancelarReserva(cancelarNumero.id); setIsCancelando(false); if (ok) setCancelarNumero(null); }} disabled={isCancelando}>{isCancelando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Confirmar Cancelamento</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendedorPainel;