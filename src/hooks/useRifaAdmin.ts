import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Rifa, NumeroRifa, VendedorRifa, ClienteRifa, CartelaRifa, SolicitacaoVendedor, CadastroVendedor, AcertoVendedor } from '@/types/rifa';

export const useRifaAdmin = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;

    const channelName = `admin-rifa-changes-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compras_rifa' }, () => {
        queryClient.invalidateQueries({ queryKey: ['todasComprasRifa'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendas_bingo_fisico' }, () => {
        queryClient.invalidateQueries({ queryKey: ['todasFolhasBingoAdmin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_vendedor' }, () => {
        queryClient.invalidateQueries({ queryKey: ['solicitacoesVendedor'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acertos_vendedor' }, () => {
        queryClient.invalidateQueries({ queryKey: ['acertosAdmin'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, queryClient]);

  const { data: todasRifas = [], isLoading: isLoadingRifas } = useQuery({
    queryKey: ['rifasAdmin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rifas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Rifa[];
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: vendedores = [], isLoading: isLoadingVendedores } = useQuery({
    queryKey: ['vendedoresRifa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendedores_rifa')
        .select('*')
        .order('nome');
      if (error) throw error;
      return data as VendedorRifa[];
    },
    enabled: isAdmin,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientesRifa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes_rifa')
        .select('*')
        .order('nome');
      if (error) throw error;
      return data as ClienteRifa[];
    },
    enabled: isAdmin,
  });

  const { data: todasCompras = [], isLoading: isLoadingCompras } = useQuery({
    queryKey: ['todasComprasRifa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras_rifa')
        .select('*, rifas(nome), cartelas_rifa(codigo_validacao, numeros_rifa(nome_comprador, telefone_comprador, endereco_comprador))')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('[useRifaAdmin] Erro ao buscar compras_rifa:', error);
        throw error;
      }
      return data as any[];
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: todasFolhasBingo = [] } = useQuery({
    queryKey: ['todasFolhasBingoAdmin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendas_bingo_fisico')
        .select('*, partidas(name), vendedores_rifa(nome, codigo_ref)'); 
      if (error) throw error;
      return data as any[];
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: solicitacoesVendedor = [], isLoading: isLoadingSolicitacoes } = useQuery({
    queryKey: ['solicitacoesVendedor'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitacoes_vendedor')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map(s => s.user_id))];
      
      const [resPerfis, resCadastros] = await Promise.all([
        supabase.from('perfis').select('id, full_name, avatar_url').in('id', userIds),
        supabase.from('cadastro_vendedor').select('*').in('user_id', userIds)
      ]);

      const profilesData = resPerfis.data || [];
      const cadastrosData = resCadastros.data || [];

      return data.map(s => ({
        ...s,
        perfis: profilesData.find(p => p.id === s.user_id) || null,
        cadastro: cadastrosData.find(c => c.user_id === s.user_id) || null
      })) as SolicitacaoVendedor[];
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: acertosPendentes = [] } = useQuery({
    queryKey: ['acertosAdmin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acertos_vendedor')
        .select('*, vendedores_rifa(nome)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AcertoVendedor[];
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: vendedoresComStats = [] } = useQuery({
    queryKey: ['vendedoresComStats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendedores_rifa')
        .select('*')
        .order('nome');
        
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map(v => v.user_id).filter(Boolean))];
      
      let profilesData: any[] = [];
      let cadastrosData: any[] = [];
      
      if (userIds.length > 0) {
        const [resPerfis, resCadastros] = await Promise.all([
          supabase.from('perfis').select('id, full_name, avatar_url').in('id', userIds),
          supabase.from('cadastro_vendedor').select('*').in('user_id', userIds)
        ]);
        
        profilesData = resPerfis.data || [];
        cadastrosData = resCadastros.data || [];
      }

      return data.map(v => ({
        ...v,
        perfis: profilesData?.find(p => p.id === v.user_id) || null,
        cadastro: cadastrosData?.find(c => c.user_id === v.user_id) || null
      }));
    },
    enabled: isAdmin,
    refetchOnWindowFocus: false,
  });

  const criarRifa = async (payload: Partial<Rifa>): Promise<string | null> => {
    const { data, error } = await supabase
      .from('rifas')
      .insert([payload])
      .select('id')
      .single();
    if (error) {
      toast.error('Erro ao criar rifa: ' + error.message);
      return null;
    }
    const rifaId = data.id as string;
    const { error: errPop } = await supabase.rpc('popular_numeros_rifa', {
      p_rifa_id: rifaId,
      p_inicio: payload.numero_inicial ?? 1,
      p_quantidade: payload.quantidade_numeros ?? 100,
    });
    if (errPop) {
      toast.error('Rifa criada, mas erro ao popular números: ' + errPop.message);
    } else {
      toast.success('Rifa criada com sucesso!');
    }
    queryClient.invalidateQueries({ queryKey: ['rifasAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['rifas'] });
    queryClient.invalidateQueries({ queryKey: ['numerosRifa'] });
    return rifaId;
  };

  const uploadImagemRifa = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const filePath = `rifa_img_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    
    const { error } = await supabase.storage.from('avatars').upload(filePath, file);
    if (error) { 
      toast.error(`Erro ao enviar imagem: ${error.message}`); 
      return null; 
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const atualizarRifa = async (rifaId: string, payload: Partial<Rifa>): Promise<boolean> => {
    const clean = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined)
    );
    const { data, error } = await supabase.from('rifas').update(clean).eq('id', rifaId).select();
    
    if (error) {
      toast.error('Erro ao atualizar rifa: ' + error.message);
      return false;
    }
    if (!data || data.length === 0) {
      toast.error('Erro de permissão: A rifa não foi salva (Atualize as políticas do Supabase).');
      return false;
    }
    toast.success('Rifa atualizada!');
    queryClient.invalidateQueries({ queryKey: ['rifasAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['rifas'] });
    return true;
  };

  const finalizarRifa = async (rifaId: string, numeroGanhador: number): Promise<boolean> => {
    const { data, error } = await supabase.rpc('finalizar_rifa', {
      p_rifa_id: rifaId,
      p_numero_ganhador: numeroGanhador,
    });
    if (error || !data?.success) {
      const msg = data?.error;
      if (msg === 'unauthorized') toast.error('Ação não autorizada.');
      else toast.error('Erro ao finalizar rifa.');
      return false;
    }
    toast.success('Rifa finalizada! Ganhador registrado.');
    queryClient.invalidateQueries({ queryKey: ['rifasAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['rifas'] });
    queryClient.invalidateQueries({ queryKey: ['numerosRifa'] });
    return true;
  };

  const deletarRifa = async (rifaId: string): Promise<boolean> => {
    const { data, error } = await supabase.from('rifas').delete().eq('id', rifaId).select();
    if (error) {
      toast.error('Erro ao deletar rifa.');
      return false;
    }
    if (!data || data.length === 0) {
      toast.error('A rifa não pôde ser apagada (Verifique permissões RLS).');
      return false;
    }
    toast.success('Rifa deletada.');
    queryClient.invalidateQueries({ queryKey: ['rifasAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['rifas'] });
    return true;
  };

  const cancelarRifa = async (rifaId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('rifas')
      .update({ status: 'cancelada' })
      .eq('id', rifaId)
      .select();
    if (error) {
      toast.error('Erro ao cancelar rifa.');
      return false;
    }
    if (!data || data.length === 0) {
      toast.error('Erro ao cancelar: Sem permissão RLS.');
      return false;
    }
    toast.success('Rifa cancelada.');
    queryClient.invalidateQueries({ queryKey: ['rifasAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['rifas'] });
    return true;
  };

  const criarVendedor = async (payload: Partial<VendedorRifa>): Promise<boolean> => {
    const { error } = await supabase.from('vendedores_rifa').insert([payload]);
    if (error) {
      toast.error('Erro ao criar vendedor.');
      return false;
    }
    toast.success('Vendedor criado!');
    queryClient.invalidateQueries({ queryKey: ['vendedoresRifa'] });
    return true;
  };

  const atualizarVendedor = async (vendedorId: string, payload: Partial<VendedorRifa>): Promise<boolean> => {
    const { error } = await supabase.from('vendedores_rifa').update(payload).eq('id', vendedorId);
    if (error) {
      toast.error('Erro ao atualizar vendedor.');
      return false;
    }
    toast.success('Vendedor atualizado!');
    queryClient.invalidateQueries({ queryKey: ['vendedoresRifa'] });
    queryClient.invalidateQueries({ queryKey: ['vendedoresComStats'] });
    return true;
  };

  const salvarEdicaoCompletaVendedor = async (
    vendedorId: string, 
    userId: string, 
    payloadRifa: Partial<VendedorRifa>, 
    payloadCadastro: Partial<CadastroVendedor>
  ): Promise<boolean> => {
    const { error: err1 } = await supabase.from('vendedores_rifa').update(payloadRifa).eq('id', vendedorId);
    if (err1) {
      toast.error(`Erro ao atualizar taxas do vendedor: ${err1.message}`);
      return false;
    }

    if (userId && payloadCadastro) {
      const { data: existing } = await supabase.from('cadastro_vendedor').select('id').eq('user_id', userId).maybeSingle();
      if (existing) {
        const { error: err2 } = await supabase.from('cadastro_vendedor').update(payloadCadastro).eq('user_id', userId);
        if (err2) { toast.error(`Erro ao atualizar cadastro: ${err2.message}`); return false; }
      } else {
        const { error: err3 } = await supabase.from('cadastro_vendedor').insert({ user_id: userId, ...payloadCadastro });
        if (err3) { toast.error(`Erro ao inserir cadastro: ${err3.message}`); return false; }
      }
    }

    toast.success('Dados do vendedor atualizados com sucesso!');
    queryClient.invalidateQueries({ queryKey: ['vendedoresComStats'] });
    return true;
  };

  const aprovarVendedor = async (solicitacaoId: string, mensagemAdmin?: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('aprovar_vendedor', {
      p_solicitacao_id: solicitacaoId,
      p_comissao: 0,
      p_desconto: 0,
      p_mensagem_admin: mensagemAdmin ?? null,
    });

    if (error) {
      toast.error(`Erro no servidor: ${error.message}`);
      return false;
    }

    if (!data?.success) {
      toast.error('Não foi possível aprovar: ' + (data?.error ?? 'Erro desconhecido'));
      return false;
    }

    toast.success('Vendedor aprovado!');
    queryClient.invalidateQueries({ queryKey: ['solicitacoesVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['vendedoresRifa'] });
    queryClient.invalidateQueries({ queryKey: ['vendedoresComStats'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    return true;
  };

  const rejeitarVendedor = async (solicitacaoId: string, mensagemAdmin?: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('rejeitar_vendedor', {
      p_solicitacao_id: solicitacaoId,
      p_mensagem_admin: mensagemAdmin ?? null,
    });

    if (error) {
      toast.error(`Erro no servidor: ${error.message}`);
      return false;
    }

    if (!data?.success) {
      toast.error('Erro ao rejeitar: ' + (data?.error ?? 'Erro desconhecido'));
      return false;
    }

    toast.success('Solicitação rejeitada.');
    queryClient.invalidateQueries({ queryKey: ['solicitacoesVendedor'] });
    return true;
  };

  const resolverAcerto = async (acertoId: string, status: 'aprovado' | 'rejeitado'): Promise<boolean> => {
    const { data, error } = await supabase.rpc('resolver_acerto_vendedor', {
      p_acerto_id: acertoId,
      p_status: status
    });

    if (error || !data?.success) {
      toast.error(`Erro ao ${status === 'aprovado' ? 'aprovar' : 'rejeitar'} o acerto financeiro.`);
      return false;
    }

    toast.success(`Acerto ${status} com sucesso! A divisão do dinheiro foi feita.`);
    queryClient.invalidateQueries({ queryKey: ['acertosAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['todasComprasRifa'] });
    queryClient.invalidateQueries({ queryKey: ['gameSettings'] }); 
    queryClient.invalidateQueries({ queryKey: ['perfis'] });
    return true;
  };

  const pagarComissaoManual = async (acertoId: string, valorComissao: number, descontarAdmin: boolean): Promise<boolean> => {
    const { data, error } = await supabase.rpc('pagar_comissao_acerto_manual', {
      p_acerto_id: acertoId,
      p_valor_comissao: valorComissao,
      p_descontar_admin: descontarAdmin
    });

    if (error || !data?.success) {
      toast.error('Erro ao pagar comissão: ' + (error?.message || data?.error || 'Erro Desconhecido'));
      return false;
    }

    toast.success('Comissão paga e creditada na conta do vendedor!');
    queryClient.invalidateQueries({ queryKey: ['acertosAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
    queryClient.invalidateQueries({ queryKey: ['perfis'] });
    return true;
  };

  const forcarRepasseAcerto = async (acertoId: string): Promise<boolean> => {
    const { data: acerto } = await supabase
        .from('acertos_vendedor')
        .select('valor')
        .eq('id', acertoId)
        .single();
    
    if (!acerto) {
      toast.error("Acerto não encontrado.");
      return false;
    }

    const valorRepasse = Number(acerto.valor);

    if (valorRepasse > 0) {
      await supabase.rpc('increment_admin_profit', { amount: valorRepasse });
      const { error: updErr } = await supabase.from('acertos_vendedor').update({ repasse_concluido: true }).eq('id', acertoId);
      if (updErr) {
        toast.error("Você precisa executar o comando SQL no Supabase para liberar o acesso a essa tabela!");
        return false;
      }
      queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
    }
    
    toast.success("Saldo repassado ao Caixa Admin com sucesso!");
    queryClient.invalidateQueries({ queryKey: ['acertosAdmin'] });
    return true;
  };

  const estornarRepasseAcerto = async (acertoId: string): Promise<boolean> => {
    const { data: acerto } = await supabase.from('acertos_vendedor').select('*').eq('id', acertoId).single();
    if (!acerto) return false;

    if (acerto.repasse_concluido && Number(acerto.valor) > 0) {
      await supabase.rpc('increment_admin_profit', { amount: -Number(acerto.valor) });
    }

    const { error } = await supabase.from('acertos_vendedor').update({
      status: 'pendente',
      repasse_concluido: false,
      resolved_at: null,
    }).eq('id', acertoId);

    if (error) {
      toast.error("Erro ao atualizar status no banco.");
      return false;
    }

    toast.success("Acerto estornado! O valor foi removido do caixa e voltou para análise.");
    queryClient.invalidateQueries({ queryKey: ['acertosAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
    return true;
  };

  const getNumerosRifaAdmin = async (rifaId: string): Promise<NumeroRifa[]> => {
    const { data, error } = await supabase
      .from('numeros_rifa')
      .select('*')
      .eq('rifa_id', rifaId)
      .order('numero');
    if (error) {
      toast.error('Erro ao buscar números da rifa.');
      return [];
    }
    return data as NumeroRifa[];
  };

  const getCartelasCompra = async (compraId: string): Promise<CartelaRifa[]> => {
    const { data, error } = await supabase
      .from('cartelas_rifa')
      .select('*')
      .eq('compra_id', compraId);
    if (error) {
      toast.error('Erro ao buscar cartelas da compra.');
      return [];
    }
    return data as CartelaRifa[];
  };

  const registrarVendaVendedor = async (rifaId: string, vendedorId: string, numeros: number[], clienteId?: string): Promise<boolean> => {
    console.warn("Using deprecated function registrarVendaVendedor");
    const { data, error } = await supabase.rpc('reservar_numeros_vendedor', {
      p_rifa_id: rifaId,
      p_numeros: numeros,
      p_pagar_depois: false,
    });
    if (error || !data?.success) {
      toast.error('Erro ao registrar venda: ' + (data?.error || error?.message));
      return false;
    }
    toast.success('Venda registrada com sucesso!');
    queryClient.invalidateQueries({ queryKey: ['minhasReservasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['minhasVendasVendedor'] });
    queryClient.invalidateQueries({ queryKey: ['numerosRifa'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    return true;
  };

  return {
    todasRifas,
    vendedores,
    vendedoresComStats,
    clientes,
    todasCompras,
    todasFolhasBingo,
    solicitacoesVendedor,
    acertosPendentes,
    isLoading: isLoadingRifas || isLoadingVendedores || isLoadingCompras,
    isLoadingSolicitacoes,
    criarRifa,
    atualizarRifa,
    deletarRifa,
    finalizarRifa,
    cancelarRifa,
    uploadImagemRifa,
    criarVendedor,
    atualizarVendedor,
    salvarEdicaoCompletaVendedor,
    aprovarVendedor,
    rejeitarVendedor,
    getNumerosRifaAdmin,
    getCartelasCompra,
    registrarVendaVendedor,
    resolverAcerto,
    forcarRepasseAcerto,
    estornarRepasseAcerto,
    pagarComissaoManual,
  };
};