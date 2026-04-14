import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSolicitacaoVendedor } from '@/hooks/useSolicitacaoVendedor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, UserCheck, Clock, XCircle, CheckCircle2, Send, UploadCloud } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SolicitarVendedor = () => {
  const navigate = useNavigate();
  const {
    minhasSolicitacoes,
    solicitacaoPendente,
    solicitacaoAprovada,
    solicitacaoRejeitada,
    isLoading,
    solicitarVendedor,
    cancelarSolicitacao,
  } = useSolicitacaoVendedor();

  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [mensagem, setMensagem] = useState('');
  
  const [foto, setFoto] = useState<File | null>(null);
  const [documentoFile, setDocumentoFile] = useState<File | null>(null);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);

  const [isSending, setIsSending] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const handleSolicitar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim() || !endereco.trim() || !foto) {
        return; // Validação simples
    }
    setIsSending(true);
    await solicitarVendedor(nome, cpf, rg, telefone, endereco, mensagem, foto, documentoFile, comprovanteFile);
    setIsSending(false);
  };

  const handleCancelar = async () => {
    if (!solicitacaoPendente) return;
    setIsCanceling(true);
    await cancelarSolicitacao(solicitacaoPendente.id);
    setIsCanceling(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading text-xl font-bold">Ser Vendedor Autorizado</h1>
      </div>

      {solicitacaoAprovada && (
        <div className="card-container border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 space-y-2">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold">
            <CheckCircle2 className="w-5 h-5" />
            Você é um vendedor aprovado!
          </div>
          <p className="text-sm text-green-700 dark:text-green-300">
            Sua solicitação foi aprovada. Acesse o painel do vendedor para começar a vender.
          </p>
          <Button className="w-full mt-2 gradient-primary" onClick={() => navigate('/vendedor/painel')}>
            <UserCheck className="w-4 h-4 mr-2" />
            Ir para o Painel do Vendedor
          </Button>
        </div>
      )}

      {solicitacaoPendente && (
        <div className="card-container border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 space-y-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold">
            <Clock className="w-5 h-5" />
            Solicitação Pendente
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Sua solicitação e documentos estão aguardando análise do administrador.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/5 mt-2"
            onClick={handleCancelar}
            disabled={isCanceling}
          >
            {isCanceling ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}
            Cancelar Solicitação
          </Button>
        </div>
      )}

      {solicitacaoRejeitada && !solicitacaoPendente && !solicitacaoAprovada && (
        <div className="card-container border-destructive/30 bg-destructive/5 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-bold">
            <XCircle className="w-5 h-5" />
            Solicitação Rejeitada
          </div>
          {solicitacaoRejeitada.mensagem_admin && (
            <p className="text-sm text-muted-foreground">
              Motivo: {solicitacaoRejeitada.mensagem_admin}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Você pode enviar um novo cadastro corrigido abaixo.</p>
        </div>
      )}

      {!solicitacaoPendente && !solicitacaoAprovada && (
        <div className="card-container space-y-5 border-primary/20">
          <div>
            <h2 className="font-heading font-bold text-base mb-1">Preencha seu Cadastro Oficial</h2>
            <p className="text-sm text-muted-foreground">
              Este é o seu perfil de vendedor. Alguns dados (como foto e nome) ficarão visíveis para seus clientes na sua página pública.
            </p>
          </div>
          <form onSubmit={handleSolicitar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome Completo *</Label>
              <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome completo" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF *</Label>
                <Input id="cpf" value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" required />
                </div>
                <div className="space-y-1.5">
                <Label htmlFor="rg">RG</Label>
                <Input id="rg" value={rg} onChange={e => setRg(e.target.value)} placeholder="00.000.000-0" />
                </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="telefone">Telefone / WhatsApp *</Label>
              <Input id="telefone" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 00000-0000" required />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="endereco">Endereço Completo *</Label>
              <Input id="endereco" value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade..." required />
            </div>

            <div className="pt-4 border-t space-y-4">
                <h3 className="font-semibold text-sm">Envio de Documentos</h3>
                
                <div className="space-y-2">
                    <Label htmlFor="foto" className="text-xs">1. Foto do Perfil (Visível ao Público) *</Label>
                    <Input id="foto" type="file" accept="image/*" onChange={e => setFoto(e.target.files ? e.target.files[0] : null)} required className="file:text-xs file:bg-primary/10 file:text-primary file:border-0 file:rounded-full file:px-3 file:py-1 cursor-pointer" />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="doc" className="text-xs">2. Foto do Documento (RG ou CNH) *</Label>
                    <Input id="doc" type="file" accept="image/*,application/pdf" onChange={e => setDocumentoFile(e.target.files ? e.target.files[0] : null)} required className="file:text-xs file:bg-primary/10 file:text-primary file:border-0 file:rounded-full file:px-3 file:py-1 cursor-pointer" />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="comp" className="text-xs">3. Comprovante de Residência *</Label>
                    <Input id="comp" type="file" accept="image/*,application/pdf" onChange={e => setComprovanteFile(e.target.files ? e.target.files[0] : null)} required className="file:text-xs file:bg-primary/10 file:text-primary file:border-0 file:rounded-full file:px-3 file:py-1 cursor-pointer" />
                </div>
            </div>

            <div className="pt-2">
              <Label htmlFor="mensagem">Observação (Opcional)</Label>
              <Textarea id="mensagem" value={mensagem} onChange={e => setMensagem(e.target.value)} placeholder="Algo mais que o administrador precise saber?" rows={2} />
            </div>

            <Button type="submit" className="w-full gradient-primary h-12 mt-2" disabled={isSending || !nome || !foto || !documentoFile || !comprovanteFile}>
              {isSending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <UploadCloud className="w-5 h-5 mr-2" />}
              {isSending ? 'Enviando Cadastro...' : 'Enviar Cadastro Completo'}
            </Button>
          </form>
        </div>
      )}

      {minhasSolicitacoes.length > 1 && (
        <div className="card-container space-y-2">
          <h3 className="font-heading font-semibold text-sm">Histórico</h3>
          <div className="space-y-2">
            {minhasSolicitacoes.map(s => (
              <div key={s.id} className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2 last:border-0">
                <span>{format(new Date(s.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                <Badge variant={s.status === 'aprovado' ? 'default' : s.status === 'rejeitado' ? 'destructive' : 'secondary'} className="text-[10px]">
                  {s.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SolicitarVendedor;