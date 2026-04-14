import { useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Profile } from '@/contexts/AuthContext';
import { PlayerCard, Win, CreditRequest, RedeemRequest } from '@/types/match';

export const useAdminData = () => {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('admin-specific-data-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_credito' }, () => {
        queryClient.invalidateQueries({ queryKey: ['rawCreditRequests'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_resgate' }, () => {
        queryClient.invalidateQueries({ queryKey: ['rawRedeemRequests'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartelas_jogador' }, () => {
        queryClient.invalidateQueries({ queryKey: ['allPlayerCards'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, queryClient]);

  const { data: players = [], isLoading: isLoadingPlayers } = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data, error } = await supabase.from('perfis').select('*');
      if (error) throw error;
      return data as Profile[];
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: allPlayerCards = [] } = useQuery({
    queryKey: ['allPlayerCards'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cartelas_jogador').select('*');
      if (error) throw error;
      return data as PlayerCard[];
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: allWins = [] } = useQuery({
    queryKey: ['allWins'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vitorias').select('*');
      if (error) throw error;
      return data as Win[];
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: rawCreditRequests = [], isLoading: isLoadingRequests } = useQuery({
    queryKey: ['rawCreditRequests'],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitacoes_credito').select('*').order('requested_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const allCreditRequests = useMemo(() => {
    if (!rawCreditRequests || !players) return [];
    const playersMap = new Map(players.map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]));
    return rawCreditRequests.map(req => ({
      ...req,
      perfis: playersMap.get(req.player_id) || null
    })) as CreditRequest[];
  }, [rawCreditRequests, players]);

  const { data: rawRedeemRequests = [], isLoading: isLoadingRedeems } = useQuery({
    queryKey: ['rawRedeemRequests'],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitacoes_resgate').select('*').order('requested_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const allRedeemRequests = useMemo(() => {
    if (!rawRedeemRequests || !players) return [];
    const playersMap = new Map(players.map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]));
    return rawRedeemRequests.map(req => ({
      ...req,
      perfis: playersMap.get(req.player_id) || null
    })) as RedeemRequest[];
  }, [rawRedeemRequests, players]);

  const updatePlayerCredits = async (playerId: string, amount: number): Promise<boolean> => {
    const { data, error } = await supabase.rpc('admin_adjust_credits', {
      p_player_id: playerId,
      p_delta: amount,
    });
    if (error || !data?.success) {
      toast.error('Erro ao atualizar créditos.');
      return false;
    }
    toast.success('Créditos reais atualizados!');
    await queryClient.refetchQueries({ queryKey: ['players'] });
    await queryClient.refetchQueries({ queryKey: ['profile'] });
    return true;
  };

  const updatePlayerFakeCredits = async (playerId: string, amount: number): Promise<boolean> => {
    const { data, error } = await supabase.rpc('admin_adjust_fake_credits', {
      p_player_id: playerId,
      p_delta: amount,
    });
    if (error || !data?.success) return false;
    await queryClient.refetchQueries({ queryKey: ['players'] });
    await queryClient.refetchQueries({ queryKey: ['profile'] });
    return true;
  };

  const resolveCreditRequest = async (requestId: string, status: 'approved' | 'rejected', creditsGranted?: number, notes?: string): Promise<boolean> => {
    if (!profile || profile.role !== 'admin' || !user) return false;
    const request = allCreditRequests.find(r => r.id === requestId);
    if (!request) return false;
    
    let repasseConcluido = false;
    const amountPaid = Number(request.amount_paid || 0);

    if (status === 'approved') {
      if (creditsGranted !== undefined) {
        await updatePlayerCredits(request.player_id, creditsGranted);
      }
      if (amountPaid > 0) {
         await supabase.rpc('increment_admin_profit', { amount: amountPaid });
         repasseConcluido = true;
         queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
      }
    }

    const { error: updErr } = await supabase.from('solicitacoes_credito').update({
      status, 
      credits_granted: status === 'approved' ? creditsGranted : null,
      repasse_concluido: repasseConcluido,
      resolved_at: new Date().toISOString(), 
      resolved_by: user.id, 
      notes: notes || null,
    }).eq('id', requestId);

    if (updErr && repasseConcluido) {
        toast.error("Ocorreu um erro no servidor ao marcar como concluído.");
    }

    if (notes) {
        await supabase.from('mensagens_solicitacao').insert({
            credit_request_id: requestId,
            sender_id: user.id,
            message: notes
        });
    }

    await queryClient.refetchQueries({ queryKey: ['rawCreditRequests'] });
    return true;
  };

  const forcarRepasseCredito = async (requestId: string): Promise<boolean> => {
    const { data: request } = await supabase
        .from('solicitacoes_credito')
        .select('amount_paid')
        .eq('id', requestId)
        .single();
    
    if (!request) {
      toast.error("Solicitação não encontrada.");
      return false;
    }

    const amount = Number(request.amount_paid || 0);

    if (amount > 0) {
      await supabase.rpc('increment_admin_profit', { amount });
      const { error: updErr } = await supabase.from('solicitacoes_credito').update({ repasse_concluido: true }).eq('id', requestId);
      if (updErr) {
          toast.error("Você precisa verificar as políticas RLS para atualizar a tabela.");
          return false;
      }
      queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
    }
    
    toast.success("Saldo adicionado ao Caixa Admin com sucesso!");
    queryClient.invalidateQueries({ queryKey: ['rawCreditRequests'] });
    return true;
  };

  const estornarRepasseCredito = async (requestId: string): Promise<boolean> => {
    const request = allCreditRequests.find(r => r.id === requestId);
    if (!request) return false;

    if (request.repasse_concluido && Number(request.amount_paid) > 0) {
      await supabase.rpc('increment_admin_profit', { amount: -Number(request.amount_paid) });
    }

    if (Number(request.credits_granted) > 0) {
      await supabase.rpc('admin_adjust_credits', { p_player_id: request.player_id, p_delta: -Number(request.credits_granted) });
    }

    const { error } = await supabase.from('solicitacoes_credito').update({
      status: 'pending',
      repasse_concluido: false,
      credits_granted: null,
      resolved_at: null,
      notes: 'Estornado pelo administrador.'
    }).eq('id', requestId);

    if (error) {
       toast.error("Erro ao atualizar a solicitação no banco.");
       return false;
    }

    toast.success("Recarga estornada com sucesso!");
    queryClient.invalidateQueries({ queryKey: ['rawCreditRequests'] });
    queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
    queryClient.invalidateQueries({ queryKey: ['players'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    return true;
  };

  const unblockCreditRequest = async (requestId: string) => {
    await supabase.from('solicitacoes_credito').update({
      status: 'pending', notes: 'Solicitação reaberta pelo administrador.', resolved_at: null, resolved_by: null, credits_granted: null, repasse_concluido: false
    }).eq('id', requestId);
    toast.success('Solicitação reaberta');
    await queryClient.refetchQueries({ queryKey: ['rawCreditRequests'] });
  };

  const deleteCreditRequest = async (requestId: string) => { 
    await supabase.from('solicitacoes_credito').delete().eq('id', requestId); 
    await queryClient.refetchQueries({ queryKey: ['rawCreditRequests'] });
  };

  const resolveRedeemRequest = async (requestId: string, status: 'approved' | 'rejected', receiptFile?: File, notes?: string): Promise<boolean> => {
    if (!profile || profile.role !== 'admin' || !user) return false;
    const request = allRedeemRequests.find(r => r.id === requestId);
    if (!request) return false;
    
    let receiptPath = null;

    if (status === 'approved') {
        // 1. Upload do comprovante
        if (receiptFile) {
            const fileName = `redeems/${requestId}/${Date.now()}.${receiptFile.name.split('.').pop()}`;
            await supabase.storage.from('receipts').upload(fileName, receiptFile);
            receiptPath = fileName;
        }
        
        // 2. Subtrai do lucro do Admin (Saída de Caixa) - USANDO O VALOR REAL EM DINHEIRO
        await supabase.rpc('increment_admin_profit', { amount: -Number(request.amount_to_receive) });
        queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
    }

    // 3. Atualiza o status da solicitação
    await supabase.from('solicitacoes_resgate').update({
        status, 
        receipt_url: receiptPath, 
        notes: notes || null, 
        resolved_at: new Date().toISOString(), 
        resolved_by: user.id
    }).eq('id', requestId);

    if (notes) {
        await supabase.from('mensagens_resgate').insert({ 
            redeem_request_id: requestId, 
            sender_id: user.id, 
            message: notes,
            admin_id: profile.id // Garante a FK do tenant
        });
    }

    await queryClient.refetchQueries({ queryKey: ['rawRedeemRequests'] });
    return true;
  };

  const unblockRedeemRequest = async (requestId: string) => {
    const request = allRedeemRequests.find(r => r.id === requestId);
    if (!request) return;
    
    await supabase.from('solicitacoes_resgate').update({
        status: 'pending',
        notes: 'Solicitação reaberta pelo administrador.',
        resolved_at: null,
        resolved_by: null,
    }).eq('id', requestId);
    
    toast.success('Solicitação de resgate reaberta.');
    await queryClient.refetchQueries({ queryKey: ['rawRedeemRequests'] });
  };

  const deleteRedeemRequest = async (requestId: string) => {
    const request = allRedeemRequests.find(r => r.id === requestId);
    if (request && request.status !== 'approved') {
        // Ao deletar uma solicitação não paga, devolvemos os créditos ao jogador
        await updatePlayerCredits(request.player_id, request.credits_requested);
        toast.info("Solicitação excluída e créditos devolvidos ao jogador.");
    }
    await supabase.from('solicitacoes_resgate').delete().eq('id', requestId);
    await queryClient.refetchQueries({ queryKey: ['rawRedeemRequests'] });
  };

  const fetchRequestMessages = async (requestId: string) => {
    const { data, error } = await supabase.from('mensagens_solicitacao').select('*').eq('credit_request_id', requestId).order('created_at', { ascending: true });
    if (error) return [];
    return data;
  };

  const toggleBlockPlayer = async (playerId: string, bloqueado: boolean): Promise<boolean> => {
    const { error } = await supabase
      .from('perfis')
      .update({ bloqueado })
      .eq('id', playerId);
    if (error) {
      toast.error('Erro ao ' + (bloqueado ? 'bloquear' : 'desbloquear') + ' jogador.');
      return false;
    }
    toast.success('Jogador ' + (bloqueado ? 'bloqueado' : 'desbloqueado') + ' com sucesso!');
    await queryClient.refetchQueries({ queryKey: ['players'] });
    return true;
  };

  const deletePlayer = async (playerId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('perfis')
      .delete()
      .eq('id', playerId);
    if (error) {
      toast.error('Erro ao deletar jogador: ' + error.message);
      return false;
    }
    toast.success('Jogador deletado com sucesso!');
    await queryClient.refetchQueries({ queryKey: ['players'] });
    return true;
  };

  const fetchRedeemMessages = async (requestId: string) => {
    const { data, error } = await supabase.from('mensagens_resgate').select('*').eq('redeem_request_id', requestId).order('created_at', { ascending: true });
    if (error) return [];
    return data;
  };

  return {
    players,
    allPlayerCards,
    allWins,
    allCreditRequests,
    allRedeemRequests,
    isLoading: isLoadingPlayers || isLoadingRequests || isLoadingRedeems,
    updatePlayerCredits,
    updatePlayerFakeCredits,
    resolveCreditRequest,
    forcarRepasseCredito,
    estornarRepasseCredito,
    unblockCreditRequest,
    deleteCreditRequest,
    resolveRedeemRequest,
    unblockRedeemRequest,
    deleteRedeemRequest,
    fetchRequestMessages,
    fetchRedeemMessages,
    toggleBlockPlayer,
    deletePlayer,
  };
};