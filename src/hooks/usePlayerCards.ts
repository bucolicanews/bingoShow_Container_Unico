import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { PlayerCard, MatchCard } from '@/types/match';
import { useGameSettings } from './useGameSettings';

export const usePlayerCards = () => {
  const { user, profile } = useAuth();
  const { gameSettings } = useGameSettings();
  const queryClient = useQueryClient();

  const { data: playerCards = [] } = useQuery({
    queryKey: ['playerCards', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from('cartelas_jogador').select('*').eq('player_id', user.id);
      if (error) throw error;
      return data as PlayerCard[];
    },
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const createPlayerCard = async (options: { name: string; numbers: number[][]; creditType: 'real' | 'fake' }) => {
    if (!user || !profile || !gameSettings) return null;
    
    const isFake = options.creditType === 'fake';
    const cost = isFake ? 0 : gameSettings.custo_nova_cartela;
    const balance = isFake ? Infinity : profile.credits;

    if (!isFake && balance < cost) {
      toast.error(`Saldo de créditos reais insuficiente.`);
      return null;
    }

    try {
      const { data, error } = await supabase.rpc('buy_player_card', {
        p_name: options.name,
        p_numbers: options.numbers,
        p_credit_type: options.creditType
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['playerCards', user.id] });
      queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      return data as PlayerCard;
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar cartela.");
      return null;
    }
  };

  const deletePlayerCard = async (cardId: string) => {
    const { error } = await supabase.from('cartelas_jogador').delete().eq('id', cardId);
    if (error) {
      toast.error("Erro ao deletar cartela.", { description: error.message });
    } else {
      toast.success("Cartela excluída permanentemente.");
      queryClient.invalidateQueries({ queryKey: ['playerCards', user?.id] });
    }
  };
  
  const toggleArchivePlayerCard = async (cardId: string, archive: boolean) => {
    const { error } = await supabase.from('cartelas_jogador').update({ is_archived: archive }).eq('id', cardId);
    if (error) {
      toast.error("Erro ao alterar status da cartela.");
    } else {
      toast.success(archive ? "Cartela arquivada!" : "Cartela restaurada!");
      queryClient.invalidateQueries({ queryKey: ['playerCards', user?.id] });
    }
  };

  const buyCardUses = async (playerCardId: string) => {
    const { data, error } = await supabase.rpc('buy_card_uses', {
      p_player_card_id: playerCardId,
    });

    if (error || !data?.success) {
      const msg = data?.error;
      if (msg === 'insufficient_credits') toast.error('Saldo de créditos reais insuficiente.');
      else if (msg === 'insufficient_fake_credits') toast.error('Saldo de brincar insuficiente.');
      else if (msg === 'unauthorized') toast.error('Ação não autorizada.');
      else toast.error('Erro ao recarregar cartela.');
      return false;
    }

    queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['playerCards', user?.id] });
    return true;
  };

  // Alterado para suportar o refCode de Indicação
  const joinMatch = async (matchId: string, playerCardIds: string[], refCode?: string): Promise<MatchCard[] | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('join-match', { body: { matchId, playerCardIds, refCode } });
      
      if (error) {
        toast.error("Falha de conexão com o servidor.");
        return null;
      }

      if (data && data.success === false) {
        toast.error(data.error || "Erro ao entrar na partida.");
        return null;
      }

      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['playerCards', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['matchCards'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      
      return data?.data as MatchCard[];
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e.message}`);
      return null;
    }
  };

  const leaveMatch = async (matchId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('leave-match', { body: { matchId } });
      
      if (error) {
        toast.error("Falha de conexão com o servidor ao sair.");
        return false;
      }

      if (data && data.success === false) {
        toast.error(data.error || "Erro ao sair da partida.");
        return false;
      }

      toast.success("Você saiu da partida.", { description: "Seus créditos foram estornados." });
      
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['playerCards'] }),
        queryClient.invalidateQueries({ queryKey: ['matchCards'] }),
        queryClient.invalidateQueries({ queryKey: ['matches'] })
      ]);

      return true;
    } catch (e: any) {
      toast.error(`Erro inesperado ao sair: ${e.message}`);
      return false;
    }
  };

  const rechargeFakeCredits = async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc('recarregar_fake_credits');
    if (error || !data?.success) {
      toast.error('Erro ao recarregar créditos de brincar.');
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    return true;
  };

  return {
    playerCards,
    createPlayerCard,
    deletePlayerCard,
    toggleArchivePlayerCard,
    buyCardUses,
    joinMatch,
    leaveMatch,
    rechargeFakeCredits,
  };
};