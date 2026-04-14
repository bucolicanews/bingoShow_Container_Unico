"use client";

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '@/contexts/GameContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRifaAdmin } from '@/hooks/useRifaAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, X, Eye, ExternalLink, MessageSquare, Trash2, Coins, RefreshCw, Undo2, User, ShieldCheck, Loader2, CreditCard, Store, HandCoins, AlertTriangle, CheckCircle2 } from 'lucide-react';
import PlayerAvatar from '@/components/PlayerAvatar';
import { CreditRequest, CreditRequestMessage } from '@/types/match';
import { AcertoVendedor } from '@/types/rifa';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';

const statusConfig: Record<string, { label: string, color: string }> = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-600' },
  approved: { label: 'Aprovada', color: 'bg-success/10 text-success' },
  aprovado: { label: 'Aprovada', color: 'bg-success/10 text-success' },
  rejected: { label: 'Rejeitada', color: 'bg-destructive/10 text-destructive' },
  rejeitado: { label: 'Rejeitada', color: 'bg-destructive/10 text-destructive' },
};

const CreditRequestsAdmin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { 
    allCreditRequests, 
    resolveCreditRequest, 
    forcarRepasseCredito, 
    estornarRepasseCredito,
    deleteCreditRequest, 
    unblockCreditRequest, 
    fetchRequestMessages, 
    isLoading: isGameLoading 
  } = useGame();
  
  const { 
    acertosPendentes, 
    resolverAcerto, 
    forcarRepasseAcerto, 
    estornarRepasseAcerto,
    isLoading: isRifaLoading 
  } = useRifaAdmin();
  
  // States - Credit Requests
  const [selectedRequest, setSelectedRequest] = useState<CreditRequest | null>(null);
  const [conversationRequest, setConversationRequest] = useState<CreditRequest | null>(null);
  const [messages, setMessages] = useState<CreditRequestMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [creditsToGrant, setCreditsToGrant] = useState(0);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'delete' | null>(null);
  
  // States - Forçar Repasse
  const [requestForcarRepasse, setRequestForcarRepasse] = useState<CreditRequest | null>(null);
  const [acertoForcarRepasse, setAcertoForcarRepasse] = useState<AcertoVendedor | null>(null);
  const [isForcandoRepasse, setIsForcandoRepasse] = useState(false);
  
  // States - Estornos
  const [acertoEstorno, setAcertoEstorno] = useState<AcertoVendedor | null>(null);
  const [requestEstorno, setRequestEstorno] = useState<CreditRequest | null>(null);
  const [isEstornando, setIsEstornando] = useState(false);

  // States - Acertos
  const [acaoAcerto, setAcaoAcerto] = useState<{tipo: 'aprovado' | 'rejeitado', acerto: AcertoVendedor} | null>(null);
  const [isProcessandoAcerto, setIsProcessandoAcerto] = useState(false);

  // Generics
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(null);

  const isLoading = isGameLoading || isRifaLoading;

  useEffect(() => {
    if (!profile || profile.role !== 'admin') {
      navigate('/');
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (conversationRequest) {
      loadMessages(conversationRequest.id);
    } else {
      setMessages([]);
    }
  }, [conversationRequest]);

  const loadMessages = async (requestId: string) => {
    setIsLoadingMessages(true);
    const data = await fetchRequestMessages(requestId);
    setMessages(data);
    setIsLoadingMessages(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['rawCreditRequests'] });
    await queryClient.invalidateQueries({ queryKey: ['acertosAdmin'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleOpenDialog = (request: CreditRequest, type: 'approve' | 'reject' | 'delete') => {
    setSelectedRequest(request);
    setActionType(type);
    setCreditsToGrant(request.credits_requested || 0);
    setRejectionNotes(request.notes || '');
    setIsResolveDialogOpen(true);
  };

  const handleResolve = async () => {
    if (!selectedRequest || !actionType) return;
    if (actionType === 'delete') {
      await deleteCreditRequest(selectedRequest.id);
    } else if (actionType === 'approve') {
      await resolveCreditRequest(selectedRequest.id, 'approved', creditsToGrant, rejectionNotes);
    } else {
      await resolveCreditRequest(selectedRequest.id, 'rejected', undefined, rejectionNotes);
    }
    setIsResolveDialogOpen(false);
  };

  const handleResolverAcerto = async () => {
    if (!acaoAcerto) return;
    setIsProcessandoAcerto(true);
    const ok = await resolverAcerto(acaoAcerto.acerto.id, acaoAcerto.tipo);
    setIsProcessandoAcerto(false);
    if (ok) setAcaoAcerto(null);
  };

  const handleForcarRepasseAcerto = async () => {
    if (!acertoForcarRepasse) return;
    setIsForcandoRepasse(true);
    await forcarRepasseAcerto(acertoForcarRepasse.id);
    setIsForcandoRepasse(false);
    setAcertoForcarRepasse(null);
  };

  const handleForcarRepasseCredito = async () => {
    if (!requestForcarRepasse) return;
    setIsForcandoRepasse(true);
    await forcarRepasseCredito(requestForcarRepasse.id);
    setIsForcandoRepasse(false);
    setRequestForcarRepasse(null);
  };

  const handleEstornarAcerto = async () => {
    if (!acertoEstorno) return;
    setIsEstornando(true);
    await estornarRepasseAcerto(acertoEstorno.id);
    setIsEstornando(false);
    setAcertoEstorno(null);
  };

  const handleEstornarCredito = async () => {
    if (!requestEstorno) return;
    setIsEstornando(true);
    await estornarRepasseCredito(requestEstorno.id);
    setIsEstornando(false);
    setRequestEstorno(null);
  };

  const handleViewReceipt = async (path: string | null) => {
    if (!path) {
      toast.error('Nenhum comprovante anexado.');
      return;
    }
    if (path === 'AUTOMATIC_PAYMENT' || path.startsWith('STRIPE_')) {
        toast.info('Pagamento processado automaticamente via Cartão (Stripe). Não existe arquivo de imagem.', { duration: 5000 });
        return;
    }
    try {
      const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
      if (error) throw error;
      setComprovanteUrl(data.signedUrl);
    } catch (e) {
      toast.error('Erro ao carregar o arquivo do comprovante.');
    }
  };

  const pendingRequests = allCreditRequests.filter(r => r.status === 'pending');
  const resolvedRequests = allCreditRequests.filter(r => r.status !== 'pending');

  const pendingAcertos = acertosPendentes.filter(a => a.status === 'pendente' || a.status === 'em_analise');
  const resolvedAcertos = acertosPendentes.filter(a => a.status === 'aprovado' || a.status === 'rejeitado' || a.status === 'aprovar' || a.status === 'rejeitar');

  const totalPendentes = pendingRequests.length + pendingAcertos.length;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Entradas do Caixa</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing || isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-2 mb-6 h-12">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            Pendentes 
            {totalPendentes > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                {totalPendentes}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved" className="flex items-center gap-2">
            Resolvidas (Histórico)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <div className="card-container overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origem / Jogador</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor PIX</TableHead>
                  <TableHead className="text-center">Comprovante</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 1. MAP DE ACERTOS DE VENDEDORES (Dinheiro direto pro caixa) */}
                {pendingAcertos.map(acerto => (
                  <TableRow key={acerto.id} className="bg-amber-50/50 dark:bg-amber-900/10">
                    <TableCell className="min-w-[250px]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center shrink-0 border border-amber-200">
                          <Store className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-amber-900 dark:text-amber-400">{acerto.vendedores_rifa?.nome || 'Vendedor'}</span>
                          <Badge variant="outline" className="w-fit text-[9px] mt-1 bg-amber-100 text-amber-800 border-amber-300">Acerto de Vendas (Vendedor)</Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm min-w-[150px]">
                      <div className="font-medium">{format(new Date(acerto.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(acerto.created_at), { addSuffix: true, locale: ptBR })}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-success text-lg">R$ {Number(acerto.valor).toFixed(2).replace('.', ',')}</div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Direto p/ Caixa Admin</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="outline" size="sm" onClick={() => handleViewReceipt(acerto.comprovante_url)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver PIX
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="icon" variant="ghost" className="text-destructive h-9 w-9 bg-destructive/10 hover:bg-destructive/20" onClick={() => setAcaoAcerto({ tipo: 'rejeitado', acerto })}><X className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-success h-9 w-9 bg-success/10 hover:bg-success/20" onClick={() => setAcaoAcerto({ tipo: 'aprovado', acerto })}><Check className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {/* 2. MAP DE COMPRA DE CRÉDITOS (Jogadores Comuns) */}
                {pendingRequests.map(req => (
                  <TableRow key={req.id}>
                    <TableCell className="min-w-[250px]">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar url={req.perfis?.avatar_url || null} />
                        <div className="flex flex-col">
                          <span className="font-medium">{req.perfis?.full_name || 'Usuário Desconhecido'}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">ID: ...{req.player_id.slice(-6)}</span>
                          <button 
                              onClick={() => setConversationRequest(req)}
                              className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20 text-left hover:bg-primary/20 transition-colors w-full max-w-[280px] shadow-sm group"
                            >
                              <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                              <div className="flex flex-col overflow-hidden">
                                <span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">Abrir Conversa</span>
                                <span className="text-xs text-foreground font-medium leading-normal line-clamp-2">
                                  {req.resubmission_notes || "Ver histórico de mensagens..."}
                                </span>
                              </div>
                            </button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm min-w-[150px]">
                      <div className="font-medium">{format(new Date(req.requested_at), "dd/MM/yy HH:mm", { locale: ptBR })}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(req.requested_at), { addSuffix: true, locale: ptBR })}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-primary text-lg">R$ {Number(req.amount_paid || 0).toFixed(2).replace('.', ',')}</div>
                      <div className="text-xs font-medium text-muted-foreground">Pediu: {(req.credits_requested || 0)} cr.</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="outline" size="sm" onClick={() => handleViewReceipt(req.receipt_url)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver PIX
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="icon" variant="ghost" className="text-destructive h-9 w-9 bg-destructive/10 hover:bg-destructive/20" onClick={() => handleOpenDialog(req, 'reject')}><X className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-success h-9 w-9 bg-success/10 hover:bg-success/20" onClick={() => handleOpenDialog(req, 'approve')}><Check className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-muted-foreground h-9 w-9 hover:bg-muted" onClick={() => handleOpenDialog(req, 'delete')}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {totalPendentes === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhuma entrada pendente no momento.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="resolved">
          <div className="card-container overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem / Jogador</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status / Forma</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 1. MAP DE ACERTOS DE VENDEDORES (RESOLVIDOS) */}
                {resolvedAcertos.map(acerto => {
                  const finalStatus = acerto.status === 'aprovar' ? 'aprovado' : acerto.status === 'rejeitar' ? 'rejeitado' : acerto.status;
                  const config = statusConfig[finalStatus] || { label: finalStatus, color: 'bg-muted text-muted-foreground' };
                  
                  return (
                  <TableRow key={acerto.id} className="opacity-90 bg-amber-50/20 dark:bg-amber-900/5">
                    <TableCell className="text-sm min-w-[120px]">
                      <div className="font-medium">{format(new Date(acerto.resolved_at || acerto.created_at), "dd/MM/yy", { locale: ptBR })}</div>
                      <div className="text-[10px] text-muted-foreground">{format(new Date(acerto.resolved_at || acerto.created_at), "HH:mm", { locale: ptBR })}</div>
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <Store className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{acerto.vendedores_rifa?.nome || 'Vendedor'}</span>
                          <span className="text-[10px] text-amber-600 font-medium">Acerto Financeiro</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-success">R$ {Number(acerto.valor).toFixed(2).replace('.', ',')}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge className={`${config.color} border-none`}>{config.label}</Badge>
                        <Badge variant="outline" className="text-[9px] bg-amber-500/5 text-amber-600 border-amber-500/20">Acerto (PIX)</Badge>
                        
                        {finalStatus === 'aprovado' && (
                          acerto.repasse_concluido ? (
                            <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-700 border-green-500/30 font-bold">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Lucro Creditado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-700 border-red-500/30 font-bold animate-pulse">
                              <AlertTriangle className="w-2.5 h-2.5 mr-1" /> Erro no Repasse
                            </Badge>
                          )
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {finalStatus === 'aprovado' && !acerto.repasse_concluido && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:bg-amber-100" title="Saldo não entrou no Caixa? Forçar Repasse" onClick={() => setAcertoForcarRepasse(acerto)}>
                            <AlertTriangle className="w-4 h-4" />
                          </Button>
                        )}
                        {finalStatus === 'aprovado' && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Estornar (Remover do Caixa e Voltar para Pendente)" onClick={() => setAcertoEstorno(acerto)}>
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" title="Ver Comprovante PIX" onClick={() => handleViewReceipt(acerto.comprovante_url)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )})}

                {/* 2. MAP DE COMPRA DE CRÉDITOS (RESOLVIDOS) */}
                {resolvedRequests.map(req => {
                  const isStripe = req.receipt_url?.startsWith('STRIPE_') || req.receipt_url === 'AUTOMATIC_PAYMENT';
                  const config = statusConfig[req.status] || { label: req.status, color: 'bg-muted text-muted-foreground' };

                  return (
                  <TableRow key={req.id} className="opacity-90">
                    <TableCell className="text-sm min-w-[120px]">
                      <div className="font-medium">{format(new Date(req.resolved_at || req.requested_at), "dd/MM/yy", { locale: ptBR })}</div>
                      <div className="text-[10px] text-muted-foreground">{format(new Date(req.resolved_at || req.requested_at), "HH:mm", { locale: ptBR })}</div>
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar url={req.perfis?.avatar_url || null} />
                        <div className="flex flex-col">
                          <span className="font-medium">{req.perfis?.full_name || 'Removido'}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">ID: ...{req.player_id.slice(-6)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-primary">R$ {Number(req.amount_paid || 0).toFixed(2).replace('.', ',')}</div>
                      <div className="text-xs text-muted-foreground">{(req.credits_granted || 0)} cr. liberados</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5">
                         <Badge className={`${config.color} border-none`}>{config.label}</Badge>
                         {isStripe ? (
                           <Badge variant="outline" className="text-[9px] bg-primary/5 text-primary border-primary/20"><CreditCard className="w-3 h-3 mr-1"/> Cartão (Stripe)</Badge>
                         ) : (
                           <Badge variant="outline" className="text-[9px] bg-blue-500/5 text-blue-600 border-blue-500/20">Recarga PIX</Badge>
                         )}

                         {req.status === 'approved' && (
                           req.repasse_concluido ? (
                             <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-700 border-green-500/30 font-bold">
                               <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Lucro Creditado
                             </Badge>
                           ) : (
                             <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-700 border-red-500/30 font-bold animate-pulse">
                               <AlertTriangle className="w-2.5 h-2.5 mr-1" /> Erro no Repasse
                             </Badge>
                           )
                         )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {req.status === 'approved' && !req.repasse_concluido && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:bg-amber-100" title="Saldo não entrou no Caixa? Forçar Repasse" onClick={() => setRequestForcarRepasse(req)}>
                            <AlertTriangle className="w-4 h-4" />
                          </Button>
                        )}
                        {req.status === 'approved' && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Estornar Créditos do Jogador e do Caixa" onClick={() => setRequestEstorno(req)}>
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        )}
                        {isStripe ? (
                           <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground opacity-40 cursor-not-allowed" title="Pagamento Automático (Não possui imagem anexada)">
                             <CreditCard className="w-4 h-4" />
                           </Button>
                        ) : (
                           <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" title="Ver Comprovante PIX" onClick={() => handleViewReceipt(req.receipt_url)}>
                             <Eye className="w-4 h-4" />
                           </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" title="Ver Mensagens / Avisos" onClick={() => setConversationRequest(req)}>
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        {req.status === 'rejected' && <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="Reabrir Solicitação" onClick={() => unblockCreditRequest(req.id)}><Undo2 className="w-4 h-4" /></Button>}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive opacity-70 hover:opacity-100" title="Apagar Registro" onClick={() => handleOpenDialog(req, 'delete')}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* DIALOG DE MENSAGENS / CONVERSA */}
      <Dialog open={!!conversationRequest} onOpenChange={(open) => !open && setConversationRequest(null)}>
        <DialogContent className="max-w-md h-[70vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 font-heading">
              <MessageSquare className="w-5 h-5 text-primary" /> Chat / Histórico
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-grow p-4">
            {isLoadingMessages ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
                <div className="space-y-4">
                    {messages.map(msg => {
                        const isMe = msg.sender_id === profile?.id;
                        return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}>
                                <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${isMe ? 'text-muted-foreground mr-2' : 'text-primary ml-2'}`}>
                                    {isMe ? <ShieldCheck className="w-3 h-3" /> : <User className="w-3 h-3" />}
                                    {isMe ? 'Admin (Você)' : 'Jogador'} • {format(new Date(msg.created_at), "HH:mm")}
                                </div>
                                <div className={`p-3 rounded-2xl shadow-sm max-w-[85%] text-sm border ${
                                    isMe ? 'bg-muted border-border rounded-tr-none' : 'bg-primary/10 border-primary/20 rounded-tl-none'
                                }`}>
                                    {msg.message}
                                </div>
                            </div>
                        );
                    })}
                    {messages.length === 0 && (
                        <p className="text-center text-muted-foreground text-sm py-10">Nenhuma mensagem neste histórico.</p>
                    )}
                </div>
            )}
          </ScrollArea>

          <DialogFooter className="p-4 border-t bg-muted/20">
            <DialogClose asChild><Button variant="outline" className="w-full">Fechar</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE RESOLVER SOLICITAÇÕES DE CRÉDITO (Aprovar/Rejeitar/Excluir) */}
      <Dialog open={isResolveDialogOpen} onOpenChange={setIsResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'delete' && <Trash2 className="w-5 h-5 text-destructive" />}
              {actionType === 'approve' && <Check className="w-5 h-5 text-success" />}
              {actionType === 'reject' && <X className="w-5 h-5 text-destructive" />}
              {actionType === 'delete' ? 'Excluir Solicitação' : actionType === 'approve' ? 'Confirmar Liberação de Créditos' : 'Rejeitar Comprovante'}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && actionType !== 'delete' && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Você está prestes a <strong>{actionType === 'approve' ? 'APROVAR' : 'REJEITAR'}</strong> a solicitação de <strong>{selectedRequest.perfis?.full_name || 'Usuário'}</strong>.
              </p>

              {actionType === 'approve' && (
                <div className="space-y-2">
                  <Label>Créditos a Liberar (Já preenchido com o solicitado)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={creditsToGrant}
                    onChange={e => setCreditsToGrant(Number(e.target.value) || 0)}
                    className="font-bold text-xl h-12 text-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">O valor de R$ {Number(selectedRequest.amount_paid || 0).toFixed(2)} irá para o seu Caixa.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Mensagem para o Jogador {actionType === 'reject' ? '(Obrigatório)' : '(Opcional)'}</Label>
                <Textarea
                  placeholder={actionType === 'reject' ? 'Explique por que o PIX foi rejeitado...' : 'Ex: Pagamento confirmado, boa sorte!'}
                  value={rejectionNotes}
                  onChange={e => setRejectionNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          
          {actionType === 'delete' && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir permanentemente esta solicitação do sistema?</p>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
            <Button
              variant={actionType === 'approve' ? 'default' : 'destructive'}
              className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              onClick={handleResolve}
              disabled={(actionType === 'reject' && !rejectionNotes.trim()) || (actionType === 'approve' && creditsToGrant <= 0)}
            >
              {actionType === 'approve' ? 'Liberar Créditos' : actionType === 'reject' ? 'Confirmar Rejeição' : 'Sim, Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE VISUALIZAR COMPROVANTE */}
      <Dialog open={!!comprovanteUrl} onOpenChange={(open) => !open && setComprovanteUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Visualizador de Comprovante</DialogTitle>
            <DialogDescription className="sr-only">Visualize a imagem ou o PDF enviado.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-2 bg-muted/30 rounded-lg min-h-[50vh]">
            {comprovanteUrl && (
              comprovanteUrl.toLowerCase().includes('.pdf') || comprovanteUrl.toLowerCase().includes('.pdf?') ? (
                <iframe src={comprovanteUrl} className="w-full h-[65vh] rounded-md border shadow-sm bg-white" title="Visualizador de PDF" />
              ) : (
                <img src={comprovanteUrl} alt="Comprovante" className="max-w-full max-h-[65vh] object-contain rounded-md shadow-sm" />
              )
            )}
          </div>
          <DialogFooter>
            {comprovanteUrl && (
              <Button asChild variant="outline" className="gap-2">
                <a href={comprovanteUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" /> Abrir Original / Baixar
                </a>
              </Button>
            )}
            <Button variant="default" onClick={() => setComprovanteUrl(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE RESOLVER ACERTOS DE VENDEDOR */}
      <Dialog open={!!acaoAcerto} onOpenChange={open => !open && setAcaoAcerto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {acaoAcerto?.tipo === 'aprovado' ? <HandCoins className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-destructive" />}
              {acaoAcerto?.tipo === 'aprovado' ? 'Confirmar Acerto de Vendas' : 'Rejeitar Acerto'}
            </DialogTitle>
            <DialogDescription className="sr-only">Aprove ou rejeite o PIX do vendedor.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {acaoAcerto?.tipo === 'aprovado' ? (
              <p className="text-sm text-muted-foreground">Você conferiu o PIX e o valor de <strong className="text-success text-lg">R$ {Number(acaoAcerto.acerto.valor).toFixed(2)}</strong> realmente caiu na conta?</p>
            ) : (
              <p className="text-sm text-muted-foreground">O comprovante é inválido ou o dinheiro não caiu?</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAcaoAcerto(null)}>Cancelar</Button>
            <Button className={acaoAcerto?.tipo === 'aprovado' ? 'bg-green-600 hover:bg-green-700 text-white' : ''} variant={acaoAcerto?.tipo === 'rejeitado' ? 'destructive' : 'default'} onClick={handleResolverAcerto} disabled={isProcessandoAcerto}>
              {isProcessandoAcerto && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {acaoAcerto?.tipo === 'aprovado' ? 'Sim, o dinheiro caiu!' : 'Rejeitar Acerto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE FORÇAR REPASSE DE ACERTO VENDEDOR */}
      <Dialog open={!!acertoForcarRepasse} onOpenChange={open => !open && setAcertoForcarRepasse(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-6 h-6" /> Forçar Repasse pro Caixa Admin
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
               <strong>Atenção:</strong> Utilize esta opção apenas se o sistema não tiver creditado o valor de <strong>R$ {Number(acertoForcarRepasse?.valor || 0).toFixed(2)}</strong> no Caixa do Admin ao aprovar.
             </div>
             <p className="text-sm text-muted-foreground">
               Ao confirmar, o sistema adicionará esse valor diretamente ao seu Caixa.
             </p>
             <p className="text-xs font-bold text-destructive">
               Importante: Se você clicar aqui e o saldo já tiver sido pago antes, o valor será duplicado indevidamente no Caixa.
             </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAcertoForcarRepasse(null)}>Cancelar</Button>
            <Button onClick={handleForcarRepasseAcerto} disabled={isForcandoRepasse} className="bg-amber-600 hover:bg-amber-700 text-white">
              {isForcandoRepasse && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar e Enviar p/ Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE FORÇAR REPASSE COMPRA DE CREDITOS JOGADOR */}
      <Dialog open={!!requestForcarRepasse} onOpenChange={open => !open && setRequestForcarRepasse(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-6 h-6" /> Forçar Repasse pro Caixa Admin
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
               <strong>Atenção:</strong> Utilize esta opção apenas se o sistema não tiver creditado o valor de <strong>R$ {Number(requestForcarRepasse?.amount_paid || 0).toFixed(2)}</strong> no Caixa do Admin ao aprovar.
             </div>
             <p className="text-sm text-muted-foreground">
               Ao confirmar, o sistema adicionará esse valor diretamente ao seu Caixa.
             </p>
             <p className="text-xs font-bold text-destructive">
               Importante: Se você clicar aqui e o saldo já tiver sido pago antes, o valor será duplicado indevidamente no Caixa.
             </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRequestForcarRepasse(null)}>Cancelar</Button>
            <Button onClick={handleForcarRepasseCredito} disabled={isForcandoRepasse} className="bg-amber-600 hover:bg-amber-700 text-white">
              {isForcandoRepasse && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar e Enviar p/ Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE ESTORNO DE ACERTO */}
      <Dialog open={!!acertoEstorno} onOpenChange={open => !open && setAcertoEstorno(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Undo2 className="w-6 h-6" /> Estornar Acerto
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <p className="text-sm text-muted-foreground">
               Deseja realmente estornar este acerto de <strong className="text-foreground">R$ {Number(acertoEstorno?.valor || 0).toFixed(2)}</strong>?
             </p>
             <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>O valor será <strong>descontado</strong> do seu Caixa Administrativo.</li>
                <li>A solicitação de acerto voltará para a aba "Pendentes" para ser revisada.</li>
             </ul>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAcertoEstorno(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleEstornarAcerto} disabled={isEstornando}>
              {isEstornando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE ESTORNO DE CRÉDITO */}
      <Dialog open={!!requestEstorno} onOpenChange={open => !open && setRequestEstorno(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Undo2 className="w-6 h-6" /> Estornar Recarga de Créditos
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <p className="text-sm text-muted-foreground">
               Deseja estornar esta recarga?
             </p>
             <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-2">
                <li><strong className="text-foreground">R$ {Number(requestEstorno?.amount_paid || 0).toFixed(2)}</strong> serão removidos do seu Caixa Administrativo.</li>
                <li><strong className="text-foreground">{requestEstorno?.credits_granted} créditos</strong> serão removidos do saldo do jogador.</li>
                <li>A solicitação voltará para a aba "Pendentes".</li>
             </ul>
             {requestEstorno?.receipt_url?.startsWith('STRIPE') && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded">
                  <strong>Nota:</strong> Como este pagamento foi feito via Stripe, os valores serão removidos do sistema Bingo, mas o <strong>estorno no cartão de crédito do cliente</strong> precisa ser feito manualmente por você no painel da Stripe.
                </div>
             )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRequestEstorno(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleEstornarCredito} disabled={isEstornando}>
              {isEstornando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreditRequestsAdmin;