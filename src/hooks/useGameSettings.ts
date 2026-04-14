import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GameSettings } from '@/types/match';
import { toast } from 'sonner';

export const useGameSettings = () => {
  const queryClient = useQueryClient();

  const { data: gameSettings } = useQuery({
    queryKey: ['gameSettings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracoes').select('*').limit(1).maybeSingle();
      if (error || !data) return { 
        custo_nova_cartela: 10, 
        custo_recarga_cartela: 5, 
        usos_por_recarga: 1, 
        intervalo_sorteio_auto_seg: 120, 
        valor_por_credito: 1, 
        admin_profit: 0,
        cartelas_por_folha_bingo: 4,
        auto_engine_enabled: false,
        stripe_enabled: false,
        stripe_pass_fees_to_customer: false,
        stripe_fee_percentage: 3.99,
        stripe_fee_fixed: 0.39,
        pagbank_enabled: false,
        pagbank_env: 'sandbox',
        pagbank_token_sandbox: '',
        pagbank_token_producao: '',
        pagbank_pass_fees_to_customer: false,
        pagbank_pix_fee_fixed: 0.99,
        pagbank_pix_fee_percentage: 0,
        pagbank_card_fee_fixed: 0.39,
        pagbank_card_fee_percentage: 4.99,
        live_external_enabled: false,
        live_external_provider: 'manual',
        live_external_rtmp_url: '',
        live_external_stream_key: '',
        live_external_youtube_url: '',
        live_external_facebook_url: ''
      } as GameSettings;
      return data as GameSettings;
    }
  });

  const updateGameSettings = async (newSettings: Partial<GameSettings>): Promise<boolean> => {
    const { data, error } = await supabase.rpc('update_game_settings', {
      p_settings: newSettings,
    });

    if (error || !data?.success) {
      if (data?.error === 'unauthorized') toast.error('Ação não autorizada.');
      else {
        console.error("Erro ao salvar configurações:", error);
        toast.error("Erro ao salvar no banco de dados.");
      }
      return false;
    }

    await queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
    return true;
  };

  const withdrawAdminProfit = async (amount: number): Promise<boolean> => {
    if (!gameSettings) return false;
    if (amount <= 0) {
      toast.error("O valor da retirada deve ser positivo.");
      return false;
    }
    if (amount > gameSettings.admin_profit) {
      toast.error("Você não pode retirar mais do que o lucro acumulado.");
      return false;
    }

    const { error } = await supabase.rpc('withdraw_admin_profit', { amount_to_withdraw: amount });
    
    if (error) {
      toast.error("Erro ao retirar o lucro.", { description: error.message });
      return false;
    } else {
      toast.success(`${amount} créditos retirados com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
      return true;
    }
  };

  return {
    gameSettings,
    updateGameSettings,
    withdrawAdminProfit,
  };
};