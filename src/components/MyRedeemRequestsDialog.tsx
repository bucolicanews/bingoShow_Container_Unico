import { useState, useEffect } from 'react';
import { useGame } from '@/contexts/GameContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from './ui/scroll-area';
import { Coins, Calendar, Info, CheckCircle2, AlertCircle, Clock, Banknote, RefreshCw, ExternalLink, MessageSquare, ShieldCheck, User, Loader2 } from 'lucide-react';
import { RedeemRequest, RedeemRequestMessage } from '@/types/match';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RedeemResubmissionDialog } from './RedeemResubmissionDialog';

interface MyRedeemRequestsDialogProps {
  children: React.ReactNode;
}

const statusConfig = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-600', icon: Clock },
  approved: { label: 'Concluído', color: 'bg-success/10 text-success', icon: CheckCircle2 },
  rejected: { label: 'Problema', color: 'bg-destructive/10 text-destructive', icon: AlertCircle },
};

export const MyRedeemRequestsDialog = ({ children }: MyRedeemRequestsDialogProps) => {
  const { profile } = useAuth();
  const { redeemRequests = [], fetchRedeemMessages } = useGame();

  const [conversationRequest, setConversationRequest] = useState<RedeemRequest | null>(null);
  const [messages, setMessages] = useState<RedeemRequestMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const safeRequests = Array.isArray(redeemRequests) ? redeemRequests : [];
  const pending = safeRequests.filter(r => r.status === 'pending');
  const approved = safeRequests.filter(r => r.status === 'approved');
  const rejected = safeRequests.filter(r => r.status === 'rejected');

  useEffect(() => {
    if (conversationRequest) {
      loadMessages(conversationRequest.id);
    } else {
      setMessages([]);
    }
  }, [conversationRequest]);

  const loadMessages = async (requestId: string) => {
    setIsLoadingMessages(true);
    const data = await fetchRedeemMessages(requestId);
    setMessages(data);
    setIsLoadingMessages(false);
  };

  const handleDownloadReceipt = async (path: string) => {
    try {
      const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (e) {
      toast.error('Erro ao abrir o comprovante.');
    }
  };

  const renderList = (requests: RedeemRequest[]) => {
    if (!requests || requests.length === 0) {
      return (
        <div className="text-center py-12">
          <Info className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-20" />
          <p className="text-muted-foreground text-lg">Nenhum resgate encontrado.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4 py-2 pb-6">
        {requests.map(req => {
          const config = statusConfig[req.status] || statusConfig.pending;
          const StatusIcon = config.icon;

          return (
            <div key={req.id} className="p-5 rounded-2xl bg-card border-2 border-border shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{format(new Date(req.requested_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</span>
                </div>
                <Badge className={`${config.color} border-none px-3 py-1 text-xs uppercase font-bold tracking-wider`}>
                  <StatusIcon className="w-4 h-4 mr-1.5" />
                  {config.label}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border/50">
                  <div>
                      <p className="text-xs uppercase font-black text-muted-foreground tracking-widest mb-1">Resgatado</p>
                      <p className="text-xl font-black font-heading">{req.credits_requested} créditos</p>
                  </div>
                  <div className="text-right">
                      <p className="text-xs uppercase font-black text-primary tracking-widest mb-1">A Receber</p>
                      <p className="text-2xl font-black text-primary font-heading">R$ {Number(req.amount_to_receive).toFixed(2).replace('.', ',')}</p>
                  </div>
              </div>
              
              {req.receipt_url && (
                <Button variant="outline" className="w-full h-12 text-sm font-bold border-2" onClick={() => handleDownloadReceipt(req.receipt_url!)}>
                    <ExternalLink className="w-5 h-5 mr-2 text-primary" /> Ver Comprovante do PIX
                </Button>
              )}

              <button 
                onClick={() => setConversationRequest(req)}
                className="mt-2 flex items-start gap-3 p-3 rounded-xl bg-primary/10 border-2 border-primary/20 text-left hover:bg-primary/20 transition-colors w-full shadow-sm group"
              >
                <MessageSquare className="w-6 h-6 text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-black text-primary uppercase tracking-widest mb-1">Abrir Chat da Solicitação</span>
                  <span className="text-sm text-foreground font-medium leading-snug line-clamp-2">
                    Clique para ler as mensagens enviadas pelo Administrador.
                  </span>
                </div>
              </button>

              {req.status === 'rejected' && (
                <div className="mt-4 border-t-2 pt-4">
                  <RedeemResubmissionDialog request={req}>
                    <Button variant="outline" className="w-full h-12 text-sm font-bold border-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Responder Admin / Pedir Revisão
                    </Button>
                  </RedeemResubmissionDialog>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl w-full h-[100dvh] sm:h-[85vh] max-h-[100dvh] flex flex-col p-0 overflow-hidden !rounded-none sm:!rounded-2xl border-0 sm:border">
        <DialogHeader className="p-6 pb-4 bg-background z-10 border-b shadow-sm">
          <DialogTitle className="font-heading text-3xl flex items-center gap-2">
            <Banknote className="w-8 h-8 text-primary" />
            Meus Resgates
          </DialogTitle>
          <DialogDescription className="text-base mt-1">Acompanhe o pagamento dos seus créditos resgatados.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="pending" className="flex-grow flex flex-col overflow-hidden bg-muted/10">
          <div className="px-4 sm:px-6 pt-4 pb-2 bg-background">
            <TabsList className="grid w-full grid-cols-3 h-14">
              <TabsTrigger value="pending" className="flex items-center gap-2 text-sm font-bold">
                Análise
                {pending.length > 0 && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-white">
                    {pending.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved" className="flex items-center gap-2 text-sm font-bold">
                Pagos
                {approved.length > 0 && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-xs font-black text-white">
                    {approved.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="flex items-center gap-2 text-sm font-bold">
                Problemas
                {rejected.length > 0 && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-xs font-black text-white">
                    {rejected.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-grow overflow-hidden">
            <ScrollArea className="h-full px-4 sm:px-6">
              <TabsContent value="pending" className="mt-2 focus-visible:ring-0">
                {renderList(pending)}
              </TabsContent>
              <TabsContent value="approved" className="mt-2 focus-visible:ring-0">
                {renderList(approved)}
              </TabsContent>
              <TabsContent value="rejected" className="mt-2 focus-visible:ring-0">
                {renderList(rejected)}
              </TabsContent>
            </ScrollArea>
          </div>
        </Tabs>

        {/* DIALOG NESTED PARA O CHAT */}
        <Dialog open={!!conversationRequest} onOpenChange={(open) => !open && setConversationRequest(null)}>
          <DialogContent className="max-w-md w-full h-[100dvh] sm:h-[80vh] max-h-[100dvh] flex flex-col p-0 !rounded-none sm:!rounded-2xl border-0 sm:border">
            <DialogHeader className="p-6 pb-4 border-b bg-background shadow-sm">
              <DialogTitle className="flex items-center gap-2 font-heading text-2xl">
                <MessageSquare className="w-6 h-6 text-primary" /> Chat de Pagamento
              </DialogTitle>
            </DialogHeader>

            <ScrollArea className="flex-grow p-6 bg-muted/10">
              {isLoadingMessages ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : (
                  <div className="space-y-6 pb-6">
                      {messages.map(msg => {
                          const isMe = msg.sender_id === profile?.id;
                          return (
                              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1.5`}>
                                  <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${isMe ? 'text-primary ml-2' : 'text-muted-foreground mr-2'}`}>
                                      {isMe ? <User className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4 text-success" />}
                                      {isMe ? 'Você' : 'Admin'} • {format(new Date(msg.created_at), "HH:mm")}
                                  </div>
                                  <div className={`p-4 rounded-2xl shadow-sm max-w-[85%] text-base font-medium border-2 ${
                                      isMe ? 'bg-primary/10 border-primary/20 rounded-tr-none' : 'bg-white dark:bg-card border-border rounded-tl-none'
                                  }`}>
                                      {msg.message}
                                  </div>
                              </div>
                          );
                      })}
                      {messages.length === 0 && (
                          <p className="text-center text-muted-foreground text-lg py-10 font-medium">Nenhuma mensagem neste histórico.</p>
                      )}
                  </div>
              )}
            </ScrollArea>

            <DialogFooter className="p-4 border-t bg-background">
              <Button variant="outline" className="w-full h-14 text-lg font-bold border-2" onClick={() => setConversationRequest(null)}>Voltar para Solicitações</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DialogFooter className="p-4 border-t bg-background shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <DialogClose asChild><Button variant="outline" className="w-full sm:w-auto h-14 text-lg font-bold border-2">Fechar Histórico</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};