import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Rifa, NumeroRifa, CompraRifa, CartelaRifa } from '@/types/rifa';

export const useRifas = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: rifas = [], isLoading: isLoadingRifas } = useQuery({
    queryKey: ['rifas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rifas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Rifa[];
    },
    refetchOnWindowFocus: false,
  });

  const getRifa = (rifaId: string): Rifa | undefined => rifas.find(r => r.id === rifaId);

  const { data: numerosCache = {} } = useQuery({
    queryKey: ['numerosRifa'],
    queryFn: async () => {
      // Modificado: Agora buscamos também o nome do vendedor caso exista!
      const { data, error } = await supabase.from('numeros_rifa').select('*, vendedores_rifa(nome)');
      if (error) throw error;
      const map: Record<string, NumeroRifa[]> = {};
      for (const n of data as any[]) {
        if (!map[n.rifa_id]) map[n.rifa_id] = [];
        map[n.rifa_id].push(n);
      }
      return map;
    },
    refetchOnWindowFocus: false,
  });

  const getNumerosRifa = (rifaId: string): NumeroRifa[] => numerosCache[rifaId] || [];

  const { data: minhasCompras = [], isLoading: isLoadingCompras } = useQuery({
    queryKey: ['minhasComprasRifa', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('compras_rifa')
        .select('*')
        .eq('comprador_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CompraRifa[];
    },
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const { data: minhasCartelas = [] } = useQuery({
    queryKey: ['minhasCartelasRifa', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: compras } = await supabase
        .from('compras_rifa')
        .select('id')
        .eq('comprador_id', user.id);
      if (!compras || compras.length === 0) return [];
      const compraIds = compras.map(c => c.id);
      const { data, error } = await supabase
        .from('cartelas_rifa')
        .select('*')
        .in('compra_id', compraIds);
      if (error) throw error;
      return data as CartelaRifa[];
    },
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const comprarNumeros = async (rifaId: string, numeros: number[], refCodigo?: string): Promise<boolean> => {
    const rpcName = refCodigo ? 'comprar_numeros_via_ref' : 'comprar_numeros_rifa';
    const params = refCodigo
      ? { p_rifa_id: rifaId, p_numeros: numeros, p_ref_codigo: refCodigo }
      : { p_rifa_id: rifaId, p_numeros: numeros };
    const { data, error } = await supabase.rpc(rpcName as any, params);
    if (error || !data?.success) {
      const msg = data?.error;
      if (msg === 'rifa_not_found') toast.error('Rifa não encontrada ou encerrada.');
      else if (msg === 'insufficient_credits') toast.error('Créditos insuficientes.');
      else if (msg?.startsWith('numero_indisponivel')) {
        const num = msg.split(':')[1];
        toast.error(`Número ${num} não está mais disponível.`);
      } else toast.error('Erro ao comprar números.');
      return false;
    }
    toast.success(`${numeros.length} número(s) comprado(s) com sucesso!`);
    queryClient.invalidateQueries({ queryKey: ['numerosRifa'] });
    queryClient.invalidateQueries({ queryKey: ['minhasComprasRifa', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['minhasCartelasRifa', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    return true;
  };

  const confirmarRecebimento = async (rifaId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('confirmar_ganho_rifa', { p_rifa_id: rifaId });
    if (error || !data) {
      toast.error('Erro ao confirmar recebimento.');
      return false;
    }
    toast.success('Parabéns! Recebimento confirmado.');
    queryClient.invalidateQueries({ queryKey: ['rifas'] });
    return true;
  };

  return {
    rifas,
    isLoadingRifas,
    getRifa,
    getNumerosRifa,
    minhasCompras,
    minhasCartelas,
    isLoadingCompras,
    comprarNumeros,
    confirmarRecebimento,
  };
};