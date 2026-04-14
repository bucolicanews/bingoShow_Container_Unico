import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { SolicitacaoVendedor } from '@/types/rifa';

export const useSolicitacaoVendedor = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: minhasSolicitacoes = [], isLoading } = useQuery({
    queryKey: ['minhasSolicitacoesVendedor', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('solicitacoes_vendedor')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SolicitacaoVendedor[];
    },
    enabled: !!user,
  });

  const solicitacaoPendente = minhasSolicitacoes.find(s => s.status === 'pendente');
  const solicitacaoAprovada = minhasSolicitacoes.find(s => s.status === 'aprovado');
  const solicitacaoRejeitada = minhasSolicitacoes.find(s => s.status === 'rejeitado');

  const solicitarVendedor = async (
    nome: string,
    cpf: string,
    rg: string,
    telefone: string,
    endereco: string,
    mensagem: string,
    foto: File | null,
    documento: File | null,
    comprovante: File | null
  ): Promise<boolean> => {
    if (!user) return false;
    if (solicitacaoPendente) {
      toast.error('Você já tem uma solicitação pendente.');
      return false;
    }

    try {
      let foto_url = null;
      let documento_url = null;
      let comprovante_endereco_url = null;

      // Upload da Foto para o bucket público 'avatars' (Permite salvar na raiz)
      if (foto) {
        const ext = foto.name.split('.').pop();
        const path = `vendedor_${user.id}_foto_${Date.now()}.${ext}`;
        const { error: err } = await supabase.storage.from('avatars').upload(path, foto);
        if (err) throw new Error(`Erro ao enviar foto: ${err.message}`);
        foto_url = path;
      }

      // Upload dos documentos para o bucket privado 'receipts'
      // ATENÇÃO: As regras de segurança exigem que seja salvo dentro da pasta do usuário (${user.id}/)
      if (documento) {
        const ext = documento.name.split('.').pop();
        const path = `${user.id}/vendedor_doc_${Date.now()}.${ext}`;
        const { error: err } = await supabase.storage.from('receipts').upload(path, documento);
        if (err) throw new Error(`Erro ao enviar documento: ${err.message}`);
        documento_url = path;
      }

      if (comprovante) {
        const ext = comprovante.name.split('.').pop();
        const path = `${user.id}/vendedor_comp_${Date.now()}.${ext}`;
        const { error: err } = await supabase.storage.from('receipts').upload(path, comprovante);
        if (err) throw new Error(`Erro ao enviar comprovante de endereço: ${err.message}`);
        comprovante_endereco_url = path;
      }

      // Salva na nova tabela completa de cadastro
      const { error: cadError } = await supabase.from('cadastro_vendedor').upsert({
        user_id: user.id,
        nome_completo: nome,
        cpf: cpf || null,
        rg: rg || null,
        telefone: telefone || null,
        endereco: endereco || null,
        foto_url,
        documento_url,
        comprovante_endereco_url
      });

      if (cadError) throw new Error(`Erro ao salvar o cadastro: ${cadError.message}`);

      // Cria a solicitação no painel do admin
      const { error: solError } = await supabase.from('solicitacoes_vendedor').insert([{
        user_id: user.id,
        nome: nome,
        documento: cpf || null,
        telefone: telefone || null,
        endereco: endereco || null,
        mensagem: mensagem || null,
      }]);

      if (solError) throw new Error(`Erro ao registrar a solicitação: ${solError.message}`);

      toast.success('Cadastro enviado! Aguarde a aprovação do administrador.');
      queryClient.invalidateQueries({ queryKey: ['minhasSolicitacoesVendedor', user.id] });
      return true;

    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar solicitação.');
      return false;
    }
  };

  const cancelarSolicitacao = async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('solicitacoes_vendedor')
      .delete()
      .eq('id', id)
      .eq('status', 'pendente');
    if (error) {
      toast.error('Erro ao cancelar solicitação.');
      return false;
    }
    toast.success('Solicitação cancelada.');
    queryClient.invalidateQueries({ queryKey: ['minhasSolicitacoesVendedor', user?.id] });
    return true;
  };

  return {
    minhasSolicitacoes,
    solicitacaoPendente,
    solicitacaoAprovada,
    solicitacaoRejeitada,
    isLoading,
    solicitarVendedor,
    cancelarSolicitacao,
  };
};