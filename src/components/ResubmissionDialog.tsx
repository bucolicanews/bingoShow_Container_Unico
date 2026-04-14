import { useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Send, RefreshCw } from 'lucide-react';
import { CreditRequest } from '@/types/match';

interface ResubmissionDialogProps {
  request: CreditRequest;
  children: React.ReactNode;
}

export const ResubmissionDialog = ({ request, children }: ResubmissionDialogProps) => {
  const { resubmitCreditRequest } = useGame();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Por favor, anexe o novo comprovante.');
      return;
    }
    setIsLoading(true);
    try {
      const success = await resubmitCreditRequest(request.id, file, message);
      if (success) {
        toast.success('Solicitação reenviada!', {
          description: 'O administrador foi notificado para uma nova revisão.',
        });
        setFile(null);
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
            Pedir Nova Revisão
          </DialogTitle>
          <DialogDescription>
            Anexe um novo comprovante e, se desejar, envie uma mensagem para o administrador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label htmlFor="new-receipt">Novo Comprovante</Label>
            <Input
              id="new-receipt"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
          </div>
          <div>
            <Label htmlFor="message">Mensagem (Opcional)</Label>
            <Textarea
              id="message"
              placeholder="Ex: Enviei o comprovante correto agora."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
          <Button onClick={handleSubmit} disabled={!file || isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar para Revisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};