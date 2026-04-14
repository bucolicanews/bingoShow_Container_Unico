"use client";

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '@/contexts/GameContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, X, MessageSquare, Trash2, Banknote, RefreshCw, Undo2, User, ShieldCheck, Loader2 } from 'lucide-react';
import PlayerAvatar from '@/components/PlayerAvatar';
import { RedeemRequest, RedeemRequestMessage } from '@/types/match';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';

const statusConfig = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-600' },
  approved: { label: 'Pago', color: 'bg-success/10 text-success' },
  rejected: { label: 'Bloqueado', color: 'bg-destructive/10 text-destructive' },
};

const RedeemRequestsAdmin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { allRedeemRequests, resolveRedeemRequest, deleteRedeemRequest, unblockRedeemRequest, fetchRedeemMessages, isLoading } = useGame();
  
  const [selectedRequest, setSelectedRequest] = useState<RedeemRequest | null>(null);
  const [conversationRequest, setConversationRequest] = useState<RedeemRequest | null>(null);
  const [messages, setMessages] = useState<RedeemRequestMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'delete' | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResolving, setIsResolving] = useState(false); // NOVO: Estado para prevenir duplo-clique

  useEffect(() => {
    if (!profile || profile.role !== 'admin') {
      navigate('/');
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (conversationRequest) {
      loadMessages(conversationRequest.id);
    }
  }, [conversationRequest]);

  const loadMessages = async (requestId: string) => {
    setIsLoadingMessages(true);
    const data = await fetchRedeemMessages(requestId);
    setMessages(data);
    setIsLoadingMessages(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['rawRedeemRequests'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleOpenDialog = (request: RedeemRequest, type: 'approve' | 'reject' | 'delete') => {
    setSelectedRequest(request);
    setActionType(type);
    setReceiptFile(null);
    setNotes(request.notes || '');
    setIsResolveDialogOpen(true);
  };

  const handleResolve = async () => {
    if (!selectedRequest || !actionType) return;
    
    setIsResolving(true); // Bloqueia o botão

    try {
      if (actionType === 'delete') {
        await deleteRedeemRequest(selectedRequest.id);
      } else if (actionType === 'approve') {
          if (!receiptFile) {
              toast.error('Anexe o comprovante da transferência!');
              setIsResolving(false);
              return;
          }
        await resolveRedeemRequest(selectedRequest.id, 'approved', receiptFile, notes);
      } else {
        await resolveRedeemRequest(selectedRequest.id, 'rejected', undefined, notes);
      }
      setIsResolveDialogOpen(false);
    } finally {
      setIsResolving(false); // Libera o botão
    }
  };

  const pendingRequests = allRedeemRequests.filter(r => r.status === 'pending');
  const approvedRequests = allRedeemRequests.filter(r => r.status === 'approved');
  const rejectedRequests = allRedeemRequests.filter(r => r.status === 'rejected');

  const renderHistoryTable = (requests: RedeemRequest[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Jogador</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Valor</TableHead>
          <TableHead className="text-right">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map(req => (
          <TableRow key={req.id} className="opacity-80">
            <TableCell className="min-w-[200px]">
              <div className="flex items-center gap-2 text-sm">
                <PlayerAvatar url={req.perfis?.avatar_url || null} />
                <span>{req.perfis?.full_name || 'Usuário'}</span>
              </div>
            </TableCell>
            <TableCell><Badge className={`${statusConfig[req.status]?.color || 'bg-muted'} border-none`}>{statusConfig[req.status]?.label}</Badge></TableCell>
            <TableCell><div className="text-sm font-bold text-success">R$ {Number(req.amount_to_receive).toFixed(2)}</div></TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1.5">
                {req.status === 'rejected' && <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => unblockRedeemRequest(req.id)}><Undo2 className="w-4 h-4" /></Button>}
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => handleOpenDialog(req, 'delete')}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Pagamentos (Resgates)</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing || isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-3 mb-6 h-12">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            A Pagar
            {pendingRequests.length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                {pendingRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center gap-2">
            Com Problema
            {rejectedRequests.length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {rejectedRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center gap-2">
            Pagos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <div className="card-container overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jogador</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor PIX</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map(req => (
                  <TableRow key={req.id}>
                    <TableCell className="min-w-[250px]">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar url={req.perfis?.avatar_url || null} />
                        <div className="flex flex-col">
                          <span className="font-medium">{req.perfis?.full_name || 'Usuário'}</span>
                          <button 
                              onClick={() => setConversationRequest(req)}
                              className="mt-1 flex items-center gap-1 text-[10px] text-primary font-bold hover:underline"
                            >
                              <MessageSquare className="w-3 h-3" /> Ver conversa / chave PIX
                            </button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs min-w-[150px]">
                      <div>{format(new Date(req.requested_at), "dd/MM/yy HH:mm")}</div>
                      <div className="text-muted-foreground">{formatDistanceToNow(new Date(req.requested_at), { addSuffix: true, locale: ptBR })}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-success text-lg">R$ {Number(req.amount_to_receive).toFixed(2).replace('.', ',')}</div>
                      <div className="text-xs text-muted-foreground">{req.credits_requested} créditos</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleOpenDialog(req, 'reject')}><X className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-success" onClick={() => handleOpenDialog(req, 'approve')}><Check className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-muted-foreground" onClick={() => handleOpenDialog(req, 'delete')}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {pendingRequests.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Tudo pago por aqui! ✅</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="approved">
          <div className="card-container overflow-x-auto">
            {renderHistoryTable(approvedRequests)}
          </div>
        </TabsContent>
        <TabsContent value="rejected">
          <div className="card-container overflow-x-auto">
            {renderHistoryTable(rejectedRequests)}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!conversationRequest} onOpenChange={(open) => !open && setConversationRequest(null)}>
        <DialogContent className="max-w-md h-[70vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 font-heading">
              <MessageSquare className="w-5 h-5 text-primary" /> Chat de Pagamento
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
                </div>
            )}
          </ScrollArea>

          <DialogFooter className="p-4 border-t bg-muted/20">
            <DialogClose asChild><Button variant="outline" className="w-full">Fechar</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isResolveDialogOpen} onOpenChange={setIsResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'delete' && <Trash2 className="w-5 h-5 text-destructive" />}
              {actionType === 'approve' && <Check className="w-5 h-5 text-success" />}
              {actionType === 'reject' && <X className="w-5 h-5 text-destructive" />}
              {actionType === 'delete' ? 'Excluir Solicitação' : 'Confirmar Resgate'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedRequest && actionType !== 'delete' && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-success/5 border border-success/10 rounded-lg flex items-center justify-between">
                <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Valor a Transferir</p>
                    <p className="text-2xl font-bold text-success">R$ {Number(selectedRequest.amount_to_receive).toFixed(2).replace('.', ',')}</p>
                </div>
                <Banknote className="w-10 h-10 text-success/20" />
              </div>

              {actionType === 'approve' && (
                <div className="space-y-2">
                    <Label>Anexar Comprovante de Transferência</Label>
                    <Input type="file" accept="image/*" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
                </div>
              )}

              <div className="space-y-2">
                <Label>Nota / Mensagem</Label>
                <Textarea placeholder="Explique se houver algum erro ou confirme o envio..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button variant="ghost" disabled={isResolving}>Cancelar</Button></DialogClose>
            <Button variant={actionType === 'approve' ? 'default' : 'destructive'} onClick={handleResolve} disabled={isResolving}>
                {isResolving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {actionType === 'approve' ? 'Confirmar Pagamento' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RedeemRequestsAdmin;