import { useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Send, RefreshCw } from 'lucide-react';
import { RedeemRequest } from '@/types/match';

interface RedeemResubmissionDialogProps {
  request: RedeemRequest;
  children: React.ReactNode;
}

export const RedeemResubmissionDialog = ({ request, children }: RedeemResubmissionDialogProps) => {
  const { resubmitRedeemRequest } = useGame();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error('Por favor, escreva uma mensagem para o administrador.');
      return;
    }
    setIsLoading(true);
    try {
      const success = await resubmitRedeemRequest(request.id, message);
      if (success) {
        toast.success('Resposta enviada!', {
          description: 'O administrador foi notificado para uma nova revisão.',
        });
        setMessage('');
        setIsOpen(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            Responder ao Admin
          </DialogTitle>
          <DialogDescription>
            Envie uma mensagem para o administrador para resolver o problema com seu resgate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label htmlFor="message">Sua Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Ex: Minha chave PIX correta é..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
          <Button onClick={handleSubmit} disabled={!message.trim() || isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar Resposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};