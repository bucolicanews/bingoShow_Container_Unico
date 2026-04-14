import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from './ui/scroll-area';
import { Coins, Calendar, Info, CheckCircle2, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { CreditRequest } from '@/types/match';
import { ResubmissionDialog } from './ResubmissionDialog';

interface MyCreditRequestsDialogProps {
  children: React.ReactNode;
}

const statusConfig = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-600', icon: Clock },
  approved: { label: 'Aprovada', color: 'bg-success/10 text-success', icon: CheckCircle2 },
  rejected: { label: 'Rejeitada', color: 'bg-destructive/10 text-destructive', icon: AlertCircle },
};

export const MyCreditRequestsDialog = ({ children }: MyCreditRequestsDialogProps) => {
  const { creditRequests } = useGame();

  const pending = creditRequests.filter(r => r.status === 'pending');
  const approved = creditRequests.filter(r => r.status === 'approved');
  const rejected = creditRequests.filter(r => r.status === 'rejected');

  const formatCurrency = (value: any) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '0,00';
    return num.toFixed(2).replace('.', ',');
  };

  const renderRequestList = (requests: CreditRequest[]) => {
    if (requests.length === 0) {
      return (
        <div className="text-center py-12">
          <Info className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-20" />
          <p className="text-muted-foreground text-lg">Nenhuma solicitação nesta categoria.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4 py-2 pb-6">
        {requests.map(req => {
          const config = statusConfig[req.status];
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
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
                  <p className="text-xs uppercase font-black text-muted-foreground tracking-widest mb-2">Solicitado</p>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Coins className="w-5 h-5 text-primary" />
                      <span className="text-2xl font-black font-heading">
                        {(Number(req.credits_requested) || 0)} cr.
                      </span>
                    </div>
                    <span className="text-sm font-bold text-muted-foreground mt-1">
                      Valor: R$ {formatCurrency(req.amount_paid)}
                    </span>
                  </div>
                </div>

                {req.status === 'approved' && (
                  <div className="p-4 rounded-xl bg-success/5 border-2 border-success/20">
                    <p className="text-xs uppercase font-black text-success tracking-widest mb-2">Aprovado</p>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-success" />
                        <span className="text-2xl font-black text-success font-heading">
                          {(Number(req.credits_granted) || 0)} cr.
                        </span>
                      </div>
                      <span className="text-sm font-bold text-success/80 mt-1">
                        Liberado pelo Admin
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {req.notes && req.status === 'rejected' && (
                <div className="mt-3 p-4 rounded-xl bg-destructive/5 text-sm text-destructive font-medium flex gap-3 border-2 border-destructive/20 leading-relaxed">
                  <AlertCircle className="w-6 h-6 shrink-0" />
                  <span><strong className="font-black uppercase tracking-wider block mb-1 text-xs">Motivo da Rejeição:</strong> {req.notes}</span>
                </div>
              )}

              {req.status === 'rejected' && (
                <div className="mt-4 border-t-2 pt-4">
                  <ResubmissionDialog request={req}>
                    <Button variant="outline" className="w-full h-12 text-sm font-bold border-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Pedir Nova Revisão
                    </Button>
                  </ResubmissionDialog>
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
            <Coins className="w-8 h-8 text-primary" />
            Histórico de Créditos
          </DialogTitle>
          <DialogDescription className="text-base mt-1">Acompanhe o status de todas as suas solicitações.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="pending" className="flex-grow flex flex-col overflow-hidden bg-muted/10">
          <div className="px-4 sm:px-6 pt-4 pb-2 bg-background">
            <TabsList className="grid w-full grid-cols-3 h-14">
              <TabsTrigger value="pending" className="flex items-center gap-2 text-sm font-bold">
                Pendentes
                {pending.length > 0 && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-white">
                    {pending.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved" className="flex items-center gap-2 text-sm font-bold">
                Aprovadas
                {approved.length > 0 && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-xs font-black text-white">
                    {approved.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="flex items-center gap-2 text-sm font-bold">
                Rejeitadas
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
                {renderRequestList(pending)}
              </TabsContent>
              <TabsContent value="approved" className="mt-2 focus-visible:ring-0">
                {renderRequestList(approved)}
              </TabsContent>
              <TabsContent value="rejected" className="mt-2 focus-visible:ring-0">
                {renderRequestList(rejected)}
              </TabsContent>
            </ScrollArea>
          </div>
        </Tabs>

        <DialogFooter className="p-4 border-t bg-background shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <DialogClose asChild>
            <Button variant="outline" className="w-full sm:w-auto h-14 text-lg font-bold border-2">Fechar Histórico</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};