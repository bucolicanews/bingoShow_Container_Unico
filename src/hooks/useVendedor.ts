import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { VendedorRifa, NumeroRifa, CompraRifa, AcertoVendedor } from '@/types/rifa';

export type NumeroRifaVendedor = NumeroRifa & { 
  rifas: any; 
  cartelas_rifa: { 
    codigo_validacao: string; 
    compra_id: string;
    compras_rifa: { status: string; valor_total: number; tipo_pagamento: string };
  }[]; 
};

export const useVendedor = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const isVendedor = profile?.role === 'vendedor';

  const { data: meuVendedor, isLoading: isLoadingVendedor } = useQuery({
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
      return data as VendedorRifa;
    },
    enabled: !!user && isVendedor,
  });

  const { data: minhasReservas = [], isLoading: isLoadingReservas } = useQuery({
    queryKey: ['minhasReservasVendedor', meuVendedor?.id],
    queryFn: async () => {
      if (!meuVendedor) return [];
      const { data, error } = await supabase
        .from('numeros_rifa')
        .select('*, rifas(id, nome, custo_por_numero, status), cartelas_rifa(codigo_validacao, compra_id, compras_rifa(status, valor_total, tipo_pagamento))')
        .eq('vendedor_id', meuVendedor.id)
        .in('status', ['reservado', 'vendido'])
        .order('rifa_id');
      if (error) throw error;
      return data as NumeroRifaVendedor[];
    },
    enabled: !!meuVendedor,
    refetchOnWindowFocus: false,
  });

  const { data: minhasVendas = [], isLoading: isLoadingVendas } = useQuery({
    queryKey: ['minhasVendasVendedor', meuVendedor?.id],
    queryFn: async () => {
      if (!meuVendedor) return [];
      const { data, error } = await supabase
        .from('compras_rifa')
        .select('*, rifas(nome), cartelas_rifa(codigo_validacao)')
        .eq('vendedor_id', meuVendedor.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!meuVendedor,
    refetchOnWindowFocus: false,
  });

  const { data: meusAcertos = [], isLoading: isLoadingAcertos } = useQuery({
    queryKey: ['meusAcertosVendedor', meuVendedor?.id],
    queryFn: async () => {
      if (!meuVendedor) return [];
      const { data, error } = await supabase
        .from('acertos_vendedor')
        .select('*')
        .eq('vendedor_id', meuVendedor.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AcertoVendedor[];
    },
    enabled: !!meuVendedor,
    refetchOnWindowFocus: false,
  });

  const reservarNumeros = async (rifaId: string, numeros: number[], pagarDepois: boolean = false): Promise<boolean> => {
    const { data, error } = await supabase.rpc('reservar_numeros_vendedor', {
      p_rifa_id: rifaId,
      p_numeros: numeros,
      p_pagar_depois: pagarDepois,
    });
    if (error || !data?.success) {
      const msg = data?.error;
      if (msg === 'not_a_vendor') toast.error('Você não está cadastrado como vendedor ativo.');
      else if (msg === 'rifa_not_found') toast.error('Rifa não encontrada ou encerrada.');
      else if (msg === 'insufficient_credits') toast.error('Créditos insuficientes. Marque a opção "Gerar Fiado" se precisar.');
      else if (msg?.startsWith('numero_indisponivel')) {
        const num = msg.split(':')[1];
        toast.error(`Número ${num} não está disponível.`);
      } else toast.error('Erro ao reservar números.');
      return false;
    }
    const preco = data.preco_unitario;
    if (pagarDepois) {
      toast.success(`${numeros.length} número(s) reservado(s) no FIADO. Pague para ativar.`);
    } else {
      toast.success(`${numeros.length} número(s) reservado(s)! Preço: R$ ${Number(preco).toFixed(2)} cada.`);
    }
    queryClient.invalidateQueries({ queryKey: ['minhasReservasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['minhasVendasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['numerosRifa'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    return true;
  };

  const enviarAcerto = async (bingoIds: string[], rifaIds: string[], valor: number, file: File): Promise<boolean> => {
    if (!meuVendedor || !user) return false;
    try {
      const fileName = `${user.id}/acerto_${Date.now()}.${file.name.split('.').pop()}`;
      
      const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file);
      if (uploadError) {
          console.error("Storage upload error:", uploadError);
          throw new Error('Falha ao enviar comprovante de PIX.');
      }

      const { data, error } = await supabase.rpc('enviar_acerto_vendedor', {
        p_vendedor_id: meuVendedor.id,
        p_bingo_ids: bingoIds,
        p_rifa_ids: rifaIds,
        p_valor: valor,
        p_comprovante: fileName
      });

      if (error || !data?.success) throw new Error('Falha ao registrar acerto.');

      toast.success('Acerto enviado com sucesso! Aguarde a aprovação do Administrador.');
      queryClient.invalidateQueries({ queryKey: ['meusAcertosVendedor'] });
      queryClient.invalidateQueries({ queryKey: ['folhasBingoFisico'] });
      queryClient.invalidateQueries({ queryKey: ['minhasVendasVendedor'] });
      return true;
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar acerto.');
      return false;
    }
  };

  const pagarAcertoComSaldo = async (bingoIds: string[], rifaIds: string[]): Promise<boolean> => {
    if (!user) return false;
    const { data, error } = await supabase.rpc('pagar_acerto_com_saldo', {
      p_bingo_ids: bingoIds,
      p_rifa_ids: rifaIds,
    });

    if (error || !data?.success) {
      if (data?.error === 'insufficient_credits') toast.error('Saldo de créditos insuficiente para pagar este acerto.');
      else toast.error('Erro ao processar pagamento com saldo.', { description: error?.message || data?.error });
      return false;
    }

    toast.success(`Acerto pago com seu saldo!`, {
      description: `Você recebeu R$ ${Number(data.comissao_recebida || 0).toFixed(2)} de comissão.`
    });
    
    queryClient.invalidateQueries({ queryKey: ['meusAcertosVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['folhasBingoFisico'] });
    queryClient.invalidateQueries({ queryKey: ['minhasVendasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['gameSettings'] }); // admin_profit changes
    return true;
  };

  const pagarComprasComSaldo = async (compraIds: string[]): Promise<boolean> => {
    if (!user) return false;
    const { data, error } = await supabase.rpc('pagar_compras_saldo', {
      p_compra_ids: compraIds
    });

    if (error || !data?.success) {
      if (data?.error === 'insufficient_credits') toast.error('Saldo de créditos reais insuficiente para pagar esses fiados.');
      else toast.error('Erro ao processar o pagamento com saldo.');
      return false;
    }

    toast.success(`Pagamento de R$ ${Number(data.total_pago).toFixed(2)} realizado com seu saldo! As cartelas agora são válidas.`);
    queryClient.invalidateQueries({ queryKey: ['minhasReservasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['minhasVendasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    return true;
  };

  const validarMultiplasVendas = async (
    numeroRifaIds: string[],
    nome: string,
    telefone: string,
    endereco: string,
  ): Promise<boolean> => {
    let successCount = 0;
    let totalComissao = 0;

    for (const id of numeroRifaIds) {
      const { data, error } = await supabase.rpc('validar_venda_vendedor', {
        p_numero_rifa_id: id,
        p_nome_comprador: nome,
        p_telefone_comprador: telefone || null,
        p_endereco_comprador: endereco || null,
      });

      if (!error && data?.success) {
        successCount++;
        totalComissao += Number(data.comissao_creditada || 0);
      }
    }

    if (successCount === 0) {
      toast.error('Erro ao validar as vendas. Verifique se os números já não foram validados.');
      return false;
    }

    if (successCount < numeroRifaIds.length) {
      toast.warning(`Atenção: Apenas ${successCount} de ${numeroRifaIds.length} números foram validados com sucesso.`);
    } else {
      if (totalComissao > 0) {
        toast.success(`${successCount} venda(s) validada(s) em lote! +${totalComissao.toFixed(2)} créditos de comissão.`);
      } else {
        toast.success(`${successCount} venda(s) validada(s) em lote com sucesso!`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ['minhasReservasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    return true;
  };

  const cancelarReserva = async (numeroRifaId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('cancelar_reserva_vendedor', {
      p_numero_rifa_id: numeroRifaId,
    });
    if (error || !data?.success) {
      const msg = data?.error;
      if (msg === 'not_a_vendor') toast.error('Acesso negado.');
      else if (msg === 'numero_not_found') toast.error('Número não encontrado ou já não está reservado.');
      else toast.error('Erro ao cancelar reserva.');
      return false;
    }
    const estorno = Number(data.creditos_estornados || 0);
    toast.success(`Reserva cancelada!${estorno > 0 ? ` +${estorno.toFixed(2)} créditos estornados.` : ' (Fiado estornado)'}`);
    queryClient.invalidateQueries({ queryKey: ['minhasReservasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['minhasVendasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['numerosRifa'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    return true;
  };

  const gerarLink = (rifaId?: string): string => {
    const base = window.location.origin;
    const path = rifaId ? `/rifas/${rifaId}` : '/rifas';
    const ref = meuVendedor?.codigo_ref ?? '';
    return `${base}${path}?ref=${ref}`;
  };

  return {
    meuVendedor,
    minhasReservas,
    minhasVendas,
    meusAcertos,
    isLoading: isLoadingVendedor || isLoadingReservas || isLoadingVendas || isLoadingAcertos,
    reservarNumeros,
    cancelarReserva,
    validarMultiplasVendas,
    gerarLink,
    enviarAcerto,
    pagarAcertoComSaldo,
    pagarComprasComSaldo,
  };
};