import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { RedeemRequest } from '@/types/match';

export const useRedeemRequests = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: redeemRequests = [] } = useQuery({
    queryKey: ['redeemRequests', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from('solicitacoes_resgate').select('*').eq('player_id', user.id).order('requested_at', { ascending: false });
      if (error) throw error;
      return data as RedeemRequest[];
    },
    enabled: !!user,
  });

  const requestRedeem = async (credits: number, amount: number, message?: string): Promise<boolean> => {
    if (!user || !profile) return false;

    // Chamando a nova função SQL diretamente no banco
    const { data, error } = await supabase.rpc('request_redeem', {
      p_credits: credits,
      p_amount: amount,
      p_message: message || null
    });

    if (error || !data?.success) {
      const msg = data?.error || error?.message;
      if (msg === 'insufficient_credits') toast.error('Créditos insuficientes!');
      else toast.error('Erro ao criar solicitação de resgate.');
      console.error(msg);
      return false;
    }

    // Tenta notificar o N8N de forma silenciosa (sem travar a interface se falhar)
    supabase.functions.invoke('notify-n8n', { 
      body: { event: 'REDEEM_REQUEST', data: { requestId: data.request_id, credits, amount, userEmail: user.email } } 
    }).catch(() => {});

    // Atualiza a interface
    queryClient.invalidateQueries({ queryKey: ['redeemRequests', user.id] });
    queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
    return true;
  };

  const resubmitRedeemRequest = async (requestId: string, message: string): Promise<boolean> => {
    if (!user) return false;
    const { error } = await supabase.from('solicitacoes_resgate').update({
        status: 'pending', resubmission_notes: message, resolved_at: null, resolved_by: null, notes: null
    }).eq('id', requestId);
    if (error) {
        toast.error('Falha ao reenviar solicitação.', { description: error.message });
        return false;
    }
    
    // Agora isso não falhará no banco, graças ao novo Trigger
    await supabase.from('mensagens_resgate').insert({ redeem_request_id: requestId, sender_id: user.id, message });
    
    await supabase.functions.invoke('notify-n8n', { body: { event: 'REDEEM_RESUBMISSION', data: { requestId, userEmail: user.email, message } } });
    queryClient.invalidateQueries({ queryKey: ['redeemRequests', user.id] });
    return true;
  };

  const fetchRedeemMessages = async (requestId: string) => {
    const { data, error } = await supabase
        .from('mensagens_resgate')
        .select('*')
        .eq('redeem_request_id', requestId)
        .order('created_at', { ascending: true });
    if (error) return [];
    return data;
  };

  return {
    redeemRequests,
    requestRedeem,
    resubmitRedeemRequest,
    fetchRedeemMessages,
  };
};