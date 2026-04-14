import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useRifaAdmin } from '@/hooks/useRifaAdmin';
import { useRifas } from '@/hooks/useRifas';
import { useGame } from '@/contexts/GameContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Trophy, Users, DollarSign, Hash, Loader2, CheckCircle, XCircle, AlertCircle, Pencil, Trash2, Upload, Link, Plus, X as XIcon, Image as ImageIcon, MapPin, Phone, Store, Globe, BadgePercent, StoreIcon, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { NumeroRifa, CompraRifa, Rifa } from '@/types/rifa';
import PlayerAvatar from '@/components/PlayerAvatar';

type FiltroNumeros = 'todos' | 'disponivel' | 'vendido' | 'reservado';

const statusConfig: Record<string, { label: string; badgeClass: string }> = {
  ativa: { label: 'Ativa', badgeClass: 'bg-green-500/10 text-green-600 border-green-500/20' },
  finalizada: { label: 'Finalizada', badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  cancelada: { label: 'Cancelada', badgeClass: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const numeroBadgeClass: Record<string, string> = {
  disponivel: 'bg-muted text-muted-foreground border border-border hover:bg-muted/70',
  vendido: 'bg-green-500/15 text-green-700 border border-green-500/30',
  reservado: 'bg-amber-500/15 text-amber-700 border border-amber-500/30',
};

interface EditForm {
  nome: string;
  descricao: string;
  regulamento: string;
  premio_descricao: string;
  premio_fotos: string[];
  foto_capa: string;
  custo_por_numero: number | string;
  custo_premio: number | string;
  data_encerramento: string;
}

const ImageUploadField = ({
  label,
  value,
  onChange,
  onUpload,
  uploading,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onUpload: (file: File) => Promise<string | null>;
  uploading: boolean;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'url' | 'file'>('url');

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2 mb-1.5">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${mode === 'url' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
        >
          <Link className="w-3 h-3" /> URL
        </button>
        <button
          type="button"
          onClick={() => setMode('file')}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${mode === 'file' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
        >
          <Upload className="w-3 h-3" /> Arquivo
        </button>
      </div>
      {mode === 'url' ? (
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder="https://..." />
      ) : (
        <div>
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = await onUpload(file);
            if (url) onChange(url);
          }} />
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => ref.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {uploading ? 'Enviando...' : 'Selecionar arquivo'}
          </Button>
        </div>
      )}
      {value && (
        <img src={value} alt="" className="mt-1 h-20 w-full object-cover rounded border" onError={e => (e.currentTarget.style.display = 'none')} />
      )}
    </div>
  );
};

const RifaDetalheAdmin = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { todasRifas, todasCompras, vendedores, getNumerosRifaAdmin, finalizarRifa, cancelarRifa, atualizarRifa, deletarRifa, uploadImagemRifa } = useRifaAdmin();
  const { players } = useGame();
  useRifas();

  const rifa = todasRifas.find(r => r.id === id);

  const [numeros, setNumeros] = useState<NumeroRifa[]>([]);
  const [loadingNumeros, setLoadingNumeros] = useState(false);
  const [filtroNumeros, setFiltroNumeros] = useState<FiltroNumeros>('todos');

  const [numeroGanhador, setNumeroGanhador] = useState('');
  const [confirmFinalizarOpen, setConfirmFinalizarOpen] = useState(false);
  const [confirmCancelarOpen, setConfirmCancelarOpen] = useState(false);
  const [confirmDeletarOpen, setConfirmDeletarOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [deletando, setDeletando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [uploadingCapa, setUploadingCapa] = useState(false);
  const [uploadingPremio, setUploadingPremio] = useState(false);
  const premioFileRef = useRef<HTMLInputElement>(null);
  const [premioUrlInput, setPremioUrlInput] = useState('');
  const [premioMode, setPremioMode] = useState<'url' | 'file'>('url');

  const [editForm, setEditForm] = useState<EditForm>({
    nome: '',
    descricao: '',
    regulamento: '',
    premio_descricao: '',
    premio_fotos: [],
    foto_capa: '',
    custo_por_numero: 1,
    custo_premio: 0,
    data_encerramento: '',
  });

  useEffect(() => {
    if (!id) return;
    setLoadingNumeros(true);
    getNumerosRifaAdmin(id).then(data => {
      setNumeros(data);
      setLoadingNumeros(false);
    });
  }, [id]);

  const { data: winnerProfile } = useQuery({
    queryKey: ['winnerProfileFull', rifa?.ganhador_id],
    queryFn: async () => {
      if (!rifa?.ganhador_id) return null;
      const { data } = await supabase.from('perfis').select('*').eq('id', rifa.ganhador_id).single();
      return data;
    },
    enabled: !!rifa?.ganhador_id,
  });

  const comprasRifa = useMemo(() => todasCompras.filter(c => c.rifa_id === id), [todasCompras, id]);

  const sellerStatsArray = useMemo(() => {
    if (!rifa) return [];
    
    const map: Record<string, {
      id: string;
      nome: string;
      qtdNumeros: number;
      bruto: number;
      ganhoDesconto: number;
      ganhoComissao: number;
      liquido: number;
    }> = {};

    comprasRifa.forEach(compra => {
      const isFisica = compra.tipo_pagamento === 'vendedor' && compra.vendedor_id;
      const isOnlineRef = compra.ref_vendedor_id;
      const targetVendedorId = isFisica ? compra.vendedor_id : isOnlineRef;

      if (targetVendedorId) {
        const vendedor = vendedores.find(v => v.id === targetVendedorId);
        if (!vendedor) return;

        if (!map[targetVendedorId]) {
          map[targetVendedorId] = {
            id: targetVendedorId,
            nome: vendedor.nome,
            qtdNumeros: 0,
            bruto: 0,
            ganhoDesconto: 0,
            ganhoComissao: 0,
            liquido: 0,
          };
        }

        const stat = map[targetVendedorId];
        const brutoCompra = compra.numeros.length * Number(rifa.custo_por_numero);
        
        stat.qtdNumeros += compra.numeros.length;
        stat.bruto += brutoCompra;

        if (isFisica) {
          const desconto = brutoCompra - Number(compra.valor_total);
          stat.ganhoDesconto += desconto > 0 ? desconto : 0;
          stat.liquido += Number(compra.valor_total);
        } else if (isOnlineRef) {
          const comissao = Number(compra.valor_total) * (Number(vendedor.comissao_percentual || 0) / 100);
          stat.ganhoComissao += comissao;
          stat.liquido += (Number(compra.valor_total) - comissao);
        }
      }
    });

    return Object.values(map).sort((a, b) => b.bruto - a.bruto);
  }, [comprasRifa, rifa, vendedores]);

  if (!rifa) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const vendidos = numeros.filter(n => n.status === 'vendido').length;
  const reservados = numeros.filter(n => n.status === 'reservado').length;
  const disponiveis = numeros.filter(n => n.status === 'disponivel').length;
  const total = rifa.quantidade_numeros;
  const percentualVendido = total > 0 ? Math.round((vendidos / total) * 100) : 0;

  const custoPremio = Number(rifa.custo_premio) || 0;
  const receitaTotalPrevista = total * Number(rifa.custo_por_numero);
  const receitaBrutaVendida = vendidos * Number(rifa.custo_por_numero);

  let custoVendedores = 0;
  comprasRifa.forEach(compra => {
    const brutoCompra = compra.numeros.length * Number(rifa.custo_por_numero);
    
    if (compra.tipo_pagamento === 'vendedor') {
      const descontoDado = brutoCompra - Number(compra.valor_total);
      if (descontoDado > 0) custoVendedores += descontoDado;
    } else if (compra.ref_vendedor_id) {
      const vendedorInfo = vendedores.find(v => v.id === compra.ref_vendedor_id);
      if (vendedorInfo && vendedorInfo.comissao_percentual) {
        const comissaoPaga = Number(compra.valor_total) * (Number(vendedorInfo.comissao_percentual) / 100);
        custoVendedores += comissaoPaga;
      }
    }
  });

  const receitaLiquidaCaixa = receitaBrutaVendida - custoVendedores;
  const saldoAtualLucro = receitaLiquidaCaixa - custoPremio;

  const numerosFiltrados =
    filtroNumeros === 'todos' ? numeros : numeros.filter(n => n.status === filtroNumeros);

  const cfg = statusConfig[rifa.status] ?? statusConfig.cancelada;

  // Info Ganhador
  const numeroGanhadorInfo = numeros.find(n => n.numero === rifa.numero_ganhador);
  const isVendaFisica = !!numeroGanhadorInfo?.vendedor_id;
  const vendedorNome = numeroGanhadorInfo?.vendedor_id 
    ? vendedores.find(v => v.id === numeroGanhadorInfo.vendedor_id)?.nome || 'Vendedor Desconhecido'
    : undefined;

  const ganhadorNome = numeroGanhadorInfo?.nome_comprador || winnerProfile?.full_name || 'Não identificado';
  const ganhadorTelefone = numeroGanhadorInfo?.telefone_comprador || winnerProfile?.whatsapp || 'Não informado';
  const ganhadorEndereco = numeroGanhadorInfo?.endereco_comprador || winnerProfile?.address || 'Não informado';

  const handleOpenEditar = () => {
    if (rifa) {
      let fotosParsed: string[] = [];
      if (Array.isArray(rifa.premio_fotos)) {
        fotosParsed = [...rifa.premio_fotos];
      } else if (typeof rifa.premio_fotos === 'string') {
        try {
          fotosParsed = JSON.parse(rifa.premio_fotos);
        } catch (e) {}
      }

      setEditForm({
        nome: rifa.nome || '',
        descricao: rifa.descricao ?? '',
        regulamento: rifa.regulamento ?? '',
        premio_descricao: rifa.premio_descricao ?? '',
        premio_fotos: fotosParsed,
        foto_capa: rifa.foto_capa ?? '',
        custo_por_numero: rifa.custo_por_numero,
        custo_premio: rifa.custo_premio || 0,
        data_encerramento: rifa.data_encerramento 
          ? new Date(rifa.data_encerramento).toISOString().slice(0, 16) 
          : '',
      });
    }
    setEditarOpen(true);
  };

  const handleFinalizar = async () => {
    if (!id) return;
    const num = parseInt(numeroGanhador, 10);
    if (isNaN(num)) return;
    setFinalizando(true);
    await finalizarRifa(id, num);
    setFinalizando(false);
    setConfirmFinalizarOpen(false);
  };

  const handleCancelar = async () => {
    if (!id) return;
    setCancelando(true);
    await cancelarRifa(id);
    setCancelando(false);
    setConfirmCancelarOpen(false);
  };

  const handleDeletar = async () => {
    if (!id) return;
    setDeletando(true);
    const ok = await deletarRifa(id);
    setDeletando(false);
    if (ok) navigate('/admin/rifas');
  };

  const handleAddPremioFoto = async (source: 'url' | File) => {
    if (typeof source === 'string') {
      if (!source.trim()) return;
      setEditForm(p => ({ ...p, premio_fotos: [...p.premio_fotos, source.trim()] }));
      setPremioUrlInput('');
    } else {
      setUploadingPremio(true);
      const url = await uploadImagemRifa(source);
      setUploadingPremio(false);
      if (url) setEditForm(p => ({ ...p, premio_fotos: [...p.premio_fotos, url] }));
    }
  };

  const handleRemovePremioFoto = (idx: number) => {
    setEditForm(p => ({ ...p, premio_fotos: p.premio_fotos.filter((_, i) => i !== idx) }));
  };

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSalvando(true);
    
    let dataEncParsed = null;
    if (editForm.data_encerramento) {
      const d = new Date(editForm.data_encerramento);
      if (!isNaN(d.getTime())) {
        dataEncParsed = d.toISOString();
      }
    }

    const payload: Partial<Rifa> = {
      nome: editForm.nome || undefined,
      descricao: editForm.descricao || null,
      regulamento: editForm.regulamento || null,
      premio_descricao: editForm.premio_descricao || null,
      premio_fotos: editForm.premio_fotos,
      foto_capa: editForm.foto_capa || null,
      custo_por_numero: Number(editForm.custo_por_numero),
      custo_premio: Number(editForm.custo_premio),
      data_encerramento: dataEncParsed,
    };
    
    const ok = await atualizarRifa(id, payload);
    setSalvando(false);
    if (ok) setEditarOpen(false);
  };

  const luceobruto = receitaTotalPrevista - custoPremio;

  return (
    <>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/rifas')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col min-w-0">
            <h1 className="font-heading text-lg md:text-2xl font-bold text-foreground truncate">
              {rifa.nome}
            </h1>
          </div>
          <Badge variant="outline" className={`shrink-0 ${cfg.badgeClass}`}>
            {cfg.label}
          </Badge>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleOpenEditar} 
            disabled={rifa.status === 'finalizada'}
          >
            <Pencil className="w-4 h-4 mr-1.5" /> Editar
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={() => setConfirmDeletarOpen(true)} 
            disabled={rifa.status === 'finalizada'}
          >
            <Trash2 className="w-4 h-4 mr-1.5" /> Deletar
          </Button>
        </div>
      </div>

      {/* DASHBOARD FINANCEIRO DA RIFA */}
      <div className="card-container mb-6 p-5 border-l-4 border-l-primary">
        <h2 className="font-heading text-lg font-bold mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary"/> Resumo Financeiro
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
          <div className="p-3 bg-red-200 rounded-lg border border-border/50">
             <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3 text-destructive" /> Custo do Prêmio</p>
             <p className="text-sm font-bold text-destructive">R$ {custoPremio.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-blue-200 rounded-lg border border-border/50">
             <p className="text-[10px] uppercase font-bold text-muted-foreground">Potencial (100%)</p>
             <p className="text-sm font-bold text-foreground">R$ {receitaTotalPrevista.toFixed(2)}</p>
               </div>
            <div className="p-3 bg-green-200  rounded-lg border border-border/50">
             <p className="text-[10px] uppercase font-bold text-muted-foreground">Lucro Bruto Esperado</p>
             <p className="text-sm font-bold text-foreground">R$ {luceobruto.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-purple-200 rounded-lg border border-border/50">
             <p className="text-[10px] uppercase font-bold text-muted-foreground" title="Se todos pagassem valor cheio sem desconto">Vendido (Bruto)</p>
             <p className="text-sm font-bold text-primary">R$ {receitaBrutaVendida.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
             <p className="text-[10px] uppercase font-bold text-amber-700 flex items-center gap-1" title="Soma de descontos físicos e comissões online"><BadgePercent className="w-3 h-3"/> Custo Vendedores</p>
             <p className="text-sm font-bold text-amber-600">R$ {custoVendedores.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-orange-200 rounded-lg border border-primary/20">
             <p className="text-[10px] uppercase font-bold text-primary" title="Dinheiro que realmente entrou">Receita Líquida</p>
             <p className="text-sm font-bold text-primary">R$ {receitaLiquidaCaixa.toFixed(2)}</p>
          </div>
          <div className={`p-3 rounded-lg border ${saldoAtualLucro >= 0 ? 'bg-yellow-200 border-success/30' : 'bg-destructive/10 border-destructive/30'}`}>
             <p className="text-[10px] uppercase font-bold text-muted-foreground" title="Receita Líquida - Custo do Prêmio">Saldo / Lucro</p>
             <p className={`text-sm font-bold ${saldoAtualLucro >= 0 ? 'text-success' : 'text-destructive'}`}>R$ {saldoAtualLucro.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="card-container p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
            <Hash className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Total Números</span>
          </div>
          <p className="text-2xl font-bold font-heading">{total}</p>
        </div>
        <div className="card-container p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-xs font-semibold uppercase tracking-wide">Vendidos</span>
          </div>
          <p className="text-2xl font-bold font-heading text-green-600">{vendidos}</p>
        </div>
        <div className="card-container p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Disponíveis</span>
          </div>
          <p className="text-2xl font-bold font-heading">{disponiveis}</p>
        </div>
      </div>

      <div className="card-container p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-muted-foreground">Progresso de Vendas</span>
          <span className="text-sm font-bold">{percentualVendido}%</span>
        </div>
        <Progress value={percentualVendido} className="h-3" />
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{vendidos} vendidos</span>
          <span>{reservados} reservados</span>
          <span>{disponiveis} disponíveis</span>
        </div>
      </div>

      {rifa.status === 'finalizada' && (
        <div className="card-container p-6 bg-blue-50/50 border-blue-200 mb-6 shadow-sm">
          <h3 className="font-heading font-bold text-blue-800 text-lg flex items-center gap-2 mb-4 pb-2 border-b border-blue-200">
            <Trophy className="w-5 h-5"/> Informações do Ganhador
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-4">
               <div>
                 <p className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Número Sorteado</p>
                 <p className="text-4xl font-black font-mono text-blue-700 mt-1">{String(rifa.numero_ganhador).padStart(3, '0')}</p>
               </div>
               <div>
                 <p className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Nome do Ganhador</p>
                 <p className="text-lg font-bold text-foreground mt-0.5">{ganhadorNome}</p>
               </div>
               <div>
                 <p className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Telefone / WhatsApp</p>
                 <p className="text-base font-medium mt-0.5">{ganhadorTelefone}</p>
               </div>
               <div>
                 <p className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Endereço</p>
                 <p className="text-base font-medium mt-0.5">{ganhadorEndereco}</p>
               </div>
             </div>
             
             <div className="bg-white rounded-xl p-5 border border-blue-100 shadow-sm flex flex-col justify-center">
               <p className="text-xs text-muted-foreground uppercase font-bold mb-3 flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5" /> Origem da Compra</p>
               {isVendaFisica ? (
                 <div className="space-y-3">
                   <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-sm px-3 py-1">
                     <Store className="w-4 h-4 mr-1.5" /> Venda Física (Talonário)
                   </Badge>
                   <div>
                      <p className="text-xs text-muted-foreground">Vendedor Responsável:</p>
                      <p className="text-base font-bold text-foreground">{vendedorNome}</p>
                   </div>
                   <div className="p-3 bg-blue-50/50 rounded-lg text-xs text-blue-800 border border-blue-100">
                     Este número foi vendido presencialmente. Entre em contato através do telefone acima ou acione o vendedor para organizar a entrega do prêmio.
                   </div>
                 </div>
               ) : (
                 <div className="space-y-3">
                   <Badge className="bg-primary/10 text-primary border-primary/30 text-sm px-3 py-1">
                     <Globe className="w-4 h-4 mr-1.5" /> App Online
                   </Badge>
                   <div>
                      <p className="text-xs text-muted-foreground">Status da Conta:</p>
                      <p className="text-base font-bold text-foreground">Usuário do Sistema</p>
                   </div>
                   <div className="p-3 bg-blue-50/50 rounded-lg text-xs text-blue-800 border border-blue-100">
                     Este número foi comprado usando o saldo do aplicativo. O usuário possui conta registrada na plataforma.
                   </div>
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="numeros" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6 h-12">
          <TabsTrigger value="numeros">Números</TabsTrigger>
          <TabsTrigger value="compras">
            Compras
            {comprasRifa.length > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {comprasRifa.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="vendedores">
            Vendedores
          </TabsTrigger>
          <TabsTrigger value="finalizar">Finalizar</TabsTrigger>
        </TabsList>

        <TabsContent value="numeros">
          <div className="card-container p-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {(['todos', 'disponivel', 'vendido', 'reservado'] as FiltroNumeros[]).map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={filtroNumeros === f ? 'default' : 'outline'}
                  onClick={() => setFiltroNumeros(f)}
                  className="capitalize"
                >
                  {f === 'todos'
                    ? 'Todos'
                    : f === 'disponivel'
                    ? 'Disponíveis'
                    : f === 'vendido'
                    ? 'Vendidos'
                    : 'Reservados'}
                </Button>
              ))}
            </div>

            {loadingNumeros ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5 mb-4">
                  {numerosFiltrados.map(n => (
                    <span
                      key={n.id}
                      className={`flex items-center justify-center rounded-md text-xs font-bold py-1.5 px-1 select-none ${numeroBadgeClass[n.status] ?? numeroBadgeClass.disponivel}`}
                    >
                      {n.numero}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {numerosFiltrados.length} número(s) exibido(s)
                </p>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="compras">
          <div className="space-y-3">
            {comprasRifa.length === 0 ? (
              <div className="card-container p-10 text-center">
                <XCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhuma compra registrada.</p>
              </div>
            ) : (
              comprasRifa.map(compra => {
                let vendedorInfo = null;
                const targetVendedorId = compra.vendedor_id || compra.ref_vendedor_id;
                if (targetVendedorId) {
                  const v = vendedores.find(v => v.id === targetVendedorId);
                  if (v) {
                    const vProfile = players.find(p => p.id === v.user_id);
                    vendedorInfo = {
                      nome: v.nome,
                      avatar_url: vProfile?.avatar_url
                    };
                  }
                }

                let compradorInfo = { nome: 'Desconhecido', avatar_url: null as string | null };
                if (compra.comprador_id) {
                  const p = players.find(p => p.id === compra.comprador_id);
                  if (p) {
                    compradorInfo = { nome: p.full_name || 'Usuário', avatar_url: p.avatar_url };
                  }
                } else {
                  const nomeFisico = compra.cartelas_rifa?.[0]?.numeros_rifa?.nome_comprador;
                  if (nomeFisico) {
                    compradorInfo = { nome: nomeFisico, avatar_url: null };
                  }
                }

                return (
                  <CompraCard 
                    key={compra.id} 
                    compra={compra} 
                    vendedorInfo={vendedorInfo}
                    compradorInfo={compradorInfo}
                  />
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="vendedores">
          <div className="card-container p-0 overflow-hidden">
            <div className="p-4 border-b border-border/50 flex items-center gap-2">
              <StoreIcon className="w-5 h-5 text-primary" />
              <h3 className="font-heading font-bold">Relatório de Vendedores</h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-center">Nº Vendidos</TableHead>
                    <TableHead className="text-right">Total Vendido (Bruto)</TableHead>
                    <TableHead className="text-right">Ganho (Desc/Comissão)</TableHead>
                    <TableHead className="text-right">Repassado (Líquido)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellerStatsArray.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma venda vinculada a vendedores registrada nesta rifa.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sellerStatsArray.map(stat => (
                      <TableRow key={stat.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {stat.nome}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {stat.qtdNumeros}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          R$ {stat.bruto.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-amber-600 font-bold">
                          R$ {(stat.ganhoDesconto + stat.ganhoComissao).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-primary font-bold">
                          R$ {stat.liquido.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="finalizar">
          {rifa.status === 'ativa' && (
            <div className="space-y-4">
              <div className="card-container p-5 border-amber-500/30 bg-amber-500/5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-700">Atenção</p>
                    <p className="text-sm text-amber-600/80 mt-0.5">
                      Esta ação é irreversível. Ao finalizar a rifa, o número ganhador será
                      registrado e a rifa será encerrada permanentemente.
                    </p>
                  </div>
                </div>
              </div>

              <div className="card-container p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="numero_ganhador">Número Ganhador</Label>
                  <Input
                    id="numero_ganhador"
                    type="number"
                    placeholder="Digite o número sorteado"
                    value={numeroGanhador}
                    onChange={e => setNumeroGanhador(e.target.value)}
                    min={rifa.numero_inicial}
                    max={rifa.numero_inicial + rifa.quantidade_numeros - 1}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!numeroGanhador || finalizando}
                  onClick={() => setConfirmFinalizarOpen(true)}
                >
                  {finalizando ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trophy className="w-4 h-4 mr-2" />
                  )}
                  Finalizar Rifa
                </Button>
              </div>

              <div className="card-container p-5">
                <p className="text-sm font-semibold text-destructive mb-3">Zona de Perigo</p>
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={cancelando}
                  onClick={() => setConfirmCancelarOpen(true)}
                >
                  {cancelando ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Cancelar Rifa
                </Button>
              </div>
            </div>
          )}

          {rifa.status === 'finalizada' && (
            <div className="card-container p-8 text-center bg-green-500/5 border-green-500/20">
              <Trophy className="w-14 h-14 text-green-500 mx-auto mb-4" />
              <h2 className="font-heading text-xl font-bold text-green-700 mb-2">
                Rifa Finalizada!
              </h2>
              {rifa.numero_ganhador !== null && (
                <div className="inline-flex flex-col items-center gap-1 mt-2 bg-green-500/10 rounded-xl px-6 py-3 border border-green-500/20">
                  <span className="text-xs uppercase tracking-wide font-semibold text-green-600/70">
                    Número Ganhador
                  </span>
                  <span className="text-4xl font-bold font-heading text-green-700">
                    {rifa.numero_ganhador}
                  </span>
                </div>
              )}
            </div>
          )}

          {rifa.status === 'cancelada' && (
            <div className="card-container p-8 text-center bg-muted/30">
              <XCircle className="w-14 h-14 text-muted-foreground/40 mx-auto mb-4" />
              <h2 className="font-heading text-xl font-bold text-muted-foreground mb-2">
                Rifa Cancelada
              </h2>
              <p className="text-sm text-muted-foreground">
                Esta rifa foi cancelada e não pode ser reativada.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={confirmFinalizarOpen} onOpenChange={setConfirmFinalizarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Confirmar Finalização
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Você está prestes a finalizar a rifa{' '}
              <strong className="text-foreground">{rifa.nome}</strong> com o número ganhador:
            </p>
            <div className="flex items-center justify-center bg-primary/10 rounded-xl py-4 border border-primary/20">
              <span className="text-4xl font-bold font-heading text-primary">{numeroGanhador}</span>
            </div>
            <p className="text-xs text-destructive font-semibold text-center">
              Esta ação é irreversível.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmFinalizarOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleFinalizar} disabled={finalizando}>
              {finalizando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancelarOpen} onOpenChange={setConfirmCancelarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              Cancelar Rifa
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja cancelar a rifa{' '}
              <strong className="text-foreground">{rifa.nome}</strong>? Esta ação é irreversível.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmCancelarOpen(false)}>
              Voltar
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleCancelar} disabled={cancelando}>
              {cancelando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Cancelar Rifa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeletarOpen} onOpenChange={setConfirmDeletarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Deletar Rifa
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja <strong className="text-destructive">deletar permanentemente</strong> a rifa{' '}
              <strong className="text-foreground">{rifa.nome}</strong>? Todos os números e compras serão removidos.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDeletarOpen(false)}>
              Voltar
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleDeletar} disabled={deletando}>
              {deletando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Deletar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editarOpen} onOpenChange={setEditarOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Editar Rifa
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSalvarEdicao} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-nome">Nome *</Label>
              <Input
                id="edit-nome"
                required
                value={editForm.nome}
                onChange={e => setEditForm(p => ({ ...p, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-descricao">Descrição</Label>
              <Textarea id="edit-descricao" rows={2} value={editForm.descricao}
                onChange={e => setEditForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-regulamento">Regulamento</Label>
              <Textarea id="edit-regulamento" rows={3} value={editForm.regulamento}
                onChange={e => setEditForm(p => ({ ...p, regulamento: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-premio-desc">Descrição do Prêmio</Label>
              <Textarea id="edit-premio-desc" rows={2} value={editForm.premio_descricao}
                onChange={e => setEditForm(p => ({ ...p, premio_descricao: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Fotos do Prêmio</Label>
              {editForm.premio_fotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {editForm.premio_fotos.map((url, idx) => (
                    <div key={`${url}-${idx}`} className="relative group">
                      <img src={url} alt="" className="h-20 w-full object-cover rounded border" onError={e => (e.currentTarget.style.display = 'none')} />
                      <button
                        type="button"
                        onClick={() => handleRemovePremioFoto(idx)}
                        className="absolute top-1 right-1 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mb-1">
                <button type="button" onClick={() => setPremioMode('url')}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${premioMode === 'url' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                  <Link className="w-3 h-3" /> URL
                </button>
                <button type="button" onClick={() => setPremioMode('file')}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${premioMode === 'file' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                  <Upload className="w-3 h-3" /> Arquivo
                </button>
              </div>
              {premioMode === 'url' ? (
                <div className="flex gap-2">
                  <Input value={premioUrlInput} onChange={e => setPremioUrlInput(e.target.value)} placeholder="https://..." />
                  <Button type="button" size="sm" variant="outline" onClick={() => handleAddPremioFoto(premioUrlInput)} disabled={!premioUrlInput.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <input ref={premioFileRef} type="file" accept="image/*" multiple className="hidden" onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    for (const f of files) await handleAddPremioFoto(f);
                    e.target.value = '';
                  }} />
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => premioFileRef.current?.click()} disabled={uploadingPremio}>
                    {uploadingPremio ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2" />}
                    {uploadingPremio ? 'Enviando...' : 'Selecionar imagens'}
                  </Button>
                </div>
              )}
            </div>

            <ImageUploadField
              label="Foto de Capa Principal"
              value={editForm.foto_capa}
              onChange={v => setEditForm(p => ({ ...p, foto_capa: v }))}
              onUpload={async (file) => {
                setUploadingCapa(true);
                const url = await uploadImagemRifa(file);
                setUploadingCapa(false);
                return url;
              }}
              uploading={uploadingCapa}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-custo">Custo por Número (R$)</Label>
                <Input id="edit-custo" type="number" step="0.01" min={0}
                  value={editForm.custo_por_numero}
                  onChange={e => setEditForm(p => ({ ...p, custo_por_numero: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-custo-premio">Custo do Prêmio (R$)</Label>
                <Input id="edit-custo-premio" type="number" step="0.01" min={0}
                  value={editForm.custo_premio}
                  onChange={e => setEditForm(p => ({ ...p, custo_premio: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-encerramento">Data de Encerramento</Label>
              <Input id="edit-encerramento" type="datetime-local"
                value={editForm.data_encerramento}
                onChange={e => setEditForm(p => ({ ...p, data_encerramento: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditarOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 gradient-primary" disabled={salvando}>
                {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const CompraCard = ({ 
  compra, 
  vendedorInfo,
  compradorInfo
}: { 
  compra: any; 
  vendedorInfo?: { nome: string, avatar_url?: string | null } | null;
  compradorInfo: { nome: string, avatar_url?: string | null };
}) => {
  return (
    <div className="card-container p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
      <div className="flex-1 min-w-0 space-y-3">
        {/* Comprador (Buyer) */}
        <div className="flex items-center gap-3">
          <PlayerAvatar url={compradorInfo.avatar_url} fallback={compradorInfo.nome} className="w-10 h-10 border shadow-sm" />
          <div>
            <p className="font-bold text-sm leading-none text-foreground">{compradorInfo.nome}</p>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <span>{format(new Date(compra.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
              <Badge variant="outline" className="text-[9px] capitalize px-1.5 py-0 bg-muted">
                {compra.tipo_pagamento === 'creditos' ? 'Saldo App' : 'Vendedor Físico'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Números e Vendedor */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pl-[52px]">
           <div className="flex flex-wrap gap-1">
            {compra.numeros.map((n: number) => (
              <span
                key={n}
                className="inline-flex items-center justify-center rounded-md bg-green-500/15 text-green-700 border border-green-500/30 text-[10px] font-bold px-1.5 py-0.5"
              >
                {n}
              </span>
            ))}
          </div>
          
          {vendedorInfo && (
            <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-full text-[10px] font-medium text-muted-foreground border w-fit">
              <Store className="w-3 h-3" />
              <span>Vendido por:</span>
              <PlayerAvatar url={vendedorInfo.avatar_url} fallback={vendedorInfo.nome} className="w-4 h-4" />
              <strong className="text-foreground">{vendedorInfo.nome}</strong>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0">
         <div className="text-left sm:text-right">
           <p className="text-[10px] uppercase font-bold text-muted-foreground">Valor Total</p>
           <span className="font-bold text-lg text-primary leading-none">
             R$ {Number(compra.valor_total).toFixed(2).replace('.', ',')}
           </span>
         </div>
         {compra.status === 'pendente' && <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">FIADO</Badge>}
         {compra.status === 'em_analise' && <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">ANÁLISE</Badge>}
         {compra.status === 'pago' && <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">PAGO</Badge>}
      </div>
    </div>
  );
};

export default RifaDetalheAdmin;