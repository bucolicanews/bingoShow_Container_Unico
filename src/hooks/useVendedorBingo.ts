import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { FolhaBingoFisico } from '@/types/match';
import { generateBingoCard } from '@/utils/bingoUtils';

export const useVendedorBingo = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: meuVendedor } = useQuery({
    queryKey: ['meuVendedor', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('vendedores_rifa')
        .select('*')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user,
  });

  const { data: folhasEmitidas = [], isLoading: isLoadingFolhas } = useQuery({
    queryKey: ['folhasBingoFisico', meuVendedor?.id],
    queryFn: async () => {
      if (!meuVendedor) return [];
      const { data, error } = await supabase
        .from('vendas_bingo_fisico')
        .select('*, partidas(name, start_time)')
        .eq('vendedor_id', meuVendedor.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as FolhaBingoFisico[];
    },
    enabled: !!meuVendedor,
    refetchOnWindowFocus: false,
  });

  const comprarFolhasBingo = async (matchId: string, quantidade: number, gridsPorFolha: number, pagarDepois: boolean = false): Promise<boolean> => {
    if (!meuVendedor) return false;

    // Gerar os grids e códigos localmente para enviar pro backend.
    // Dicionário Set para garantir que NENHUMA cartela deste lote seja idêntica.
    const generatedTracker = new Set<string>();
    const folhasPayload = [];

    for (let i = 0; i < quantidade; i++) {
      const grids = [];
      for (let j = 0; j < gridsPorFolha; j++) {
        let grid;
        let serialized;
        let attempts = 0;
        
        // Loop de verificação de unicidade extrema (embora a chance de colisão seja ínfima)
        do {
            grid = generateBingoCard();
            serialized = JSON.stringify(grid);
            attempts++;
        } while (generatedTracker.has(serialized) && attempts < 100);
        
        generatedTracker.add(serialized);
        grids.push(grid);
      }
      const codigo = Math.random().toString(36).substring(2, 10).toUpperCase();
      folhasPayload.push({ grids, codigo });
    }

    const { data, error } = await supabase.rpc('comprar_folhas_bingo_vendedor', {
      p_match_id: matchId,
      p_vendedor_id: meuVendedor.id,
      p_folhas: folhasPayload,
      p_pagar_depois: pagarDepois
    });

    if (error || !data?.success) {
      const msg = data?.error;
      if (msg === 'insufficient_credits') toast.error('Saldo de créditos reais insuficiente. Marque a opção "Gerar Fiado" se precisar.');
      else if (msg === 'match_unavailable') toast.error('Partida não disponível ou é automática.');
      else toast.error('Erro ao emitir folhas de bingo.');
      return false;
    }

    if (pagarDepois) {
        toast.success(`${quantidade} folha(s) de bingo gerada(s) no FIADO. Pague para validar.`);
    } else {
        toast.success(`${quantidade} folha(s) de bingo gerada(s) com sucesso!`);
    }
    
    queryClient.invalidateQueries({ queryKey: ['folhasBingoFisico'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['matches'] });
    return true;
  };

  return {
    meuVendedor,
    folhasEmitidas,
    isLoadingFolhas,
    comprarFolhasBingo
  };
};