import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCheck, Phone, MapPin, ArrowLeft, ShieldCheck, ShieldBan } from 'lucide-react';
import PlayerAvatar from '@/components/PlayerAvatar';

export default function VendedorPerfilPublico() {
  const { codigo } = useParams<{ codigo: string }>();
  const navigate = useNavigate();
  const [vendedor, setVendedor] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVendedor() {
      if (!codigo) return;
      setLoading(true);
      
      // 1. Busca o vendedor pelo código (traz independente de estar ativo ou não)
      const { data: vendData, error: vendErr } = await supabase
        .from('vendedores_rifa')
        .select('*')
        .eq('codigo_ref', codigo.toUpperCase())
        .single();

      if (!vendErr && vendData) {
        // 2. Busca os dados públicos do cadastro completo (cadastro_vendedor)
        const { data: cadData } = await supabase
          .from('cadastro_vendedor')
          .select('nome_completo, telefone, endereco, foto_url')
          .eq('user_id', vendData.user_id)
          .single();

        // Mescla os dados para a exibição
        setVendedor({
            ...vendData,
            nome_exibicao: cadData?.nome_completo || vendData.nome,
            telefone_exibicao: cadData?.telefone || vendData.telefone,
            endereco_exibicao: cadData?.endereco || 'Vendedor Externo Autorizado',
            foto_url: cadData?.foto_url || null
        });
      }

      setLoading(false);
    }
    loadVendedor();
  }, [codigo]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // Se o código não existe de forma alguma no banco de dados
  if (!vendedor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-4">
        <ShieldCheck className="h-16 w-16 text-muted-foreground opacity-20" />
        <h1 className="text-2xl font-bold text-foreground">Vendedor não encontrado</h1>
        <p className="text-muted-foreground">Este código de vendedor é inválido e não existe no sistema.</p>
        <Button onClick={() => navigate('/')}>Voltar ao Início</Button>
      </div>
    );
  }

  // Se o vendedor existe, mas está com o status ativo = false (Bloqueado)
  if (!vendedor.ativo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-4 bg-destructive/5">
        <ShieldBan className="h-16 w-16 text-destructive opacity-80" />
        <h1 className="text-2xl font-bold text-destructive">Vendedor Bloqueado</h1>
        <p className="text-muted-foreground max-w-sm">
          Este vendedor ({vendedor.nome_exibicao}) está temporariamente suspenso ou bloqueado e não pode realizar vendas no momento.
        </p>
        <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => navigate('/')}>
          Voltar ao Início
        </Button>
      </div>
    );
  }

  // Se o vendedor está ativo, exibe o perfil normal
  const whatsappLink = vendedor.telefone_exibicao 
    ? `https://wa.me/55${vendedor.telefone_exibicao.replace(/\D/g, '')}`
    : null;

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="card-container p-8 text-center relative overflow-hidden border-2 border-green-500/20 shadow-xl">
          <div className="absolute top-4 right-4">
            <Badge className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 gap-1.5 animate-bounce-in border-none shadow-sm">
              <UserCheck className="h-3.5 w-3.5" />
              AUTORIZADO
            </Badge>
          </div>

          <div className="flex flex-col items-center space-y-4">
            <div className="relative mt-2">
              <PlayerAvatar 
                url={vendedor.foto_url} 
                className="h-28 w-28 border-4 border-background shadow-lg"
              />
              <div className="absolute bottom-0 right-0 bg-green-500 text-white rounded-full p-1.5 border-2 border-background shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl font-bold font-heading text-foreground">{vendedor.nome_exibicao}</h1>
              <p className="text-xs font-mono font-bold text-muted-foreground tracking-widest uppercase bg-muted px-3 py-1 rounded-full inline-block">
                CÓDIGO: {vendedor.codigo_ref}
              </p>
            </div>

            <div className="w-full pt-6 space-y-3">
              <div className="flex items-center gap-4 p-4 bg-background rounded-xl border border-border/50 text-left shadow-sm">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Phone className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">WhatsApp / Telefone</p>
                  <p className="font-semibold text-foreground truncate">{vendedor.telefone_exibicao || 'Não informado'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-background rounded-xl border border-border/50 text-left shadow-sm">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Localização</p>
                  <p className="font-medium text-sm text-foreground line-clamp-2">
                    {vendedor.endereco_exibicao}
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full pt-6 grid grid-cols-1 gap-3">
              {whatsappLink && (
                <Button className="w-full gradient-primary h-14 text-base font-bold shadow-button" asChild>
                  <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                    <Phone className="h-5 w-5 mr-2" />
                    Chamar no WhatsApp
                  </a>
                </Button>
              )}
              <Button variant="outline" className="w-full h-12" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao Bingo
              </Button>
            </div>
          </div>
        </div>

        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 bg-green-500/10 text-green-700 py-2 px-4 rounded-full w-fit mx-auto font-medium">
            <ShieldCheck className="h-3.5 w-3.5" />
            Perfil Verificado Oficialmente
          </p>
        </div>
      </div>
    </div>
  );
}