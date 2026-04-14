import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CreditRequest } from '@/types/match';

export const useCreditRequests = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: creditRequests = [] } = useQuery({
    queryKey: ['creditRequests', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from('solicitacoes_credito').select('*').eq('player_id', user.id).order('requested_at', { ascending: false });
      if (error) throw error;
      return data as CreditRequest[];
    },
    enabled: !!user,
  });

  const requestCredits = async (file: File, creditsRequested: number, amountPaid: number): Promise<boolean> => {
    if (!user) return false;
    const fileName = `${user.id}/${Date.now()}.${file.name.split('.').pop()}`;
    await supabase.storage.from('receipts').upload(fileName, file);
    const { data: newRequest, error } = await supabase.from('solicitacoes_credito').insert({ 
      player_id: user.id, receipt_url: fileName, status: 'pending', credits_requested: creditsRequested, amount_paid: amountPaid,
    }).select().single();
    if (error) return false;
    
    await supabase.from('mensagens_solicitacao').insert({
        credit_request_id: newRequest.id,
        sender_id: user.id,
        message: `Nova solicitação: ${creditsRequested} créditos. Valor pago: R$ ${amountPaid.toFixed(2)}`
    });
    await supabase.functions.invoke('notify-n8n', { body: { event: 'CREDIT_REQUEST', data: { requestId: newRequest.id, creditsRequested, amountPaid, userEmail: user.email } } });
    queryClient.invalidateQueries({ queryKey: ['creditRequests', user.id] });
    return true;
  };

  const buyCreditsAutomatically = async (credits: number, amount: number): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await supabase.functions.invoke('process-payment', {
        body: { credits, amount }
      });
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['creditRequests', user.id] });
      queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      return true;
    } catch (e: any) {
      toast.error("Erro ao processar compra automática.", { description: e.message });
      return false;
    }
  };

  const resubmitCreditRequest = async (requestId: string, file: File, message: string): Promise<boolean> => {
    if (!user) return false;
    const fileName = `${user.id}/${Date.now()}.${file.name.split('.').pop()}`;
    const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file);
    if (uploadError) { toast.error('Erro ao enviar comprovante.', { description: uploadError.message }); return false; }
    const { error } = await supabase.from('solicitacoes_credito').update({
      status: 'pending', receipt_url: fileName, resubmission_notes: message, resolved_at: null, resolved_by: null, notes: null, credits_granted: null,
    }).eq('id', requestId);
    if (error) {
      toast.error('Falha ao reenviar solicitação.', { description: error.message });
      await supabase.storage.from('receipts').remove([fileName]);
      return false;
    }
    await supabase.from('mensagens_solicitacao').insert({ credit_request_id: requestId, sender_id: user.id, message: message || "Reenvio de comprovante." });
    await supabase.functions.invoke('notify-n8n', { body: { event: 'CREDIT_RESUBMISSION', data: { requestId, userEmail: user.email, message } } });
    queryClient.invalidateQueries({ queryKey: ['creditRequests', user.id] });
    return true;
  };

  return {
    creditRequests,
    requestCredits,
    buyCreditsAutomatically,
    resubmitCreditRequest,
  };
};