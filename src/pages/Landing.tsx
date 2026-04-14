import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, BarChart, CheckCircle, CheckSquare, DollarSign, Gem, Globe, Landmark, LayoutPanelLeft, Link, Percent, Rocket, ShoppingCart, Ticket, Users, Wrench } from "lucide-react";

const IncludedItem = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-center gap-3">
    <CheckCircle className="h-5 w-5 text-green-500" />
    <span className="text-muted-foreground">{children}</span>
  </li>
);

const FeatureItem = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <Card className="text-center">
    <CardHeader className="items-center">
      {icon}
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

export default function LandingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto px-4 py-12 md:py-20">

        {/* Hero Section */}
        <section className="text-center pb-12">
          <Badge variant="outline" className="mb-4 text-primary">Sua Plataforma Completa de Bingo Online</Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4">
            Bingo Show de Prêmios
          </h1>
          <p className="max-w-3xl mx-auto text-lg md:text-xl text-muted-foreground mb-8">
            A solução definitiva para gerenciar, executar e expandir seu negócio de jogos com total controle e profissionalismo.
          </p>
          <Button size="lg" onClick={() => window.location.href = 'https://wa.me/5591996293532'}>
            Comprar
          </Button>              
          < Button className = "m-2 bg-red-500 text-white" size = "lg" onClick = {() => window.location.href = '/'}>          
            Partidas
          </Button>
          < Button className = "m-2 bg-green-500 text-white" size = "lg" onClick = {() => window.location.href = '/login'}>          
            Logar 
          </Button>
        </section>

        {/* Highlight Section */}
        <section className="mb-20">
            <Card className="max-w-4xl mx-auto border-primary border-2 shadow-lg">
              <CardHeader className="items-center pb-4">
                <Badge className="bg-red-500 text-primary-foreground animate-pulse">Destaque</Badge>
                <CardTitle className="text-2xl pt-2">Cartelas Múltiplas, Editáveis e Configuráveis</CardTitle>
              </CardHeader>
              <CardContent>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-lg">
                      <IncludedItem>Crie cartelas para vários Jogos</IncludedItem>
                      <IncludedItem>Configure prêmios (linha, bingo) e valores.</IncludedItem>
                      <IncludedItem>Cartelas Rastreaveis com codigo QRCOD.</IncludedItem>
                      <IncludedItem>Link de Venda de Bingo.</IncludedItem>                      
                  </ul>
              </CardContent>
            </Card>
        </section>

        {/* Included Package Section */}
        <section className="my-20">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">O que está incluso no pacote?</h2>
            <Card className="max-w-4xl mx-auto">
                <CardContent className="p-8">
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 text-lg">
                        <IncludedItem>Suporte técnico por 1 ano</IncludedItem>
                        <IncludedItem>Domínio próprio (ex: seunome.com) por 1 ano</IncludedItem>
                        <IncludedItem>Opção de domínio <code className="bg-muted px-2 py-1 rounded">mosqueiro.top</code></IncludedItem>
                        <IncludedItem>Hospedagem de alta performance por 1 ano</IncludedItem>
                        <IncludedItem>Plataforma Escalável para crescer com seu público</IncludedItem>
                        <IncludedItem>Segurança com banco de dados Supabase</IncludedItem>
                        <IncludedItem>Tecnologia Moderna (Vite + React)</IncludedItem>
                        <IncludedItem>Sistema e Banco de Dados Próprios</IncludedItem>
                        <IncludedItem>Totalmente Customizável à sua marca</IncludedItem>
                        <IncludedItem>Controle Total sobre o sistema</IncludedItem>
                    </ul>
                </CardContent>
            </Card>
        </section>

        {/* System Features Section */}
        <section className="my-20">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Funcionalidades do Sistema</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureItem
              icon={<Gem className="h-10 w-10 mb-4 text-primary" />}
              title="Bingo Automático e Manual"
              description="Realize sorteios com chamadas de número automáticas ou manuais, no seu ritmo."
            />
             <FeatureItem
              icon={<Globe className="h-10 w-10 mb-4 text-primary" />}
              title="Híbrido: Presencial e Online"
              description="Perfeito para eventos que acontecem de forma presencial e online ao mesmo tempo."
            />
            <FeatureItem
              icon={<CheckSquare className="h-10 w-10 mb-4 text-primary" />}
              title="Marcação Automática e Manual"
              description="Jogadores podem usar la marcação automática ou marcar suas próprias cartelas."
            />
            <FeatureItem
              icon={<Wrench className="h-10 w-10 mb-4 text-primary" />}
              title="Gestão Completa de Cartelas"
              description="Gere, imprima e valide cartelas vendidas e vencedoras com total segurança."
            />
            <FeatureItem
              icon={<LayoutPanelLeft className="h-10 w-10 mb-4 text-primary" />}
              title="Painel de Administração"
              description="Controle total sobre jogadores, partidas, finanças e configurações do sistema."
            />
             <FeatureItem
              icon={<ShoppingCart className="h-10 w-10 mb-4 text-primary" />}
              title="Sistema de Vendedores"
              description="Cadastre vendedores e acompanhe as vendas de cartelas em tempo real."
            />
             <FeatureItem
              icon={<Percent className="h-10 w-10 mb-4 text-primary" />}
              title="Comissão de Vendedores"
              description="Defina e pague comissões para seus vendedores de forma automática ou manual."
            />
            <FeatureItem
              icon={<Ticket className="h-10 w-10 mb-4 text-primary" />}
              title="Módulo de Rifas"
              description="Crie e gerencie rifas com venda de números, sorteio e exibição de ganhadores."
            />
            <FeatureItem
              icon={<DollarSign className="h-10 w-10 mb-4 text-primary" />}
              title="Gestão de Créditos"
              description="Sistema de créditos para jogadores comprarem cartelas, com aprovação de pedidos."
            />
            <FeatureItem
              icon={<Users className="h-10 w-10 mb-4 text-primary" />}
              title="Perfis de Jogadores"
              description="Área para jogadores acompanharem seu histórico, vitórias e créditos."
            />
             <FeatureItem
              icon={<BarChart className="h-10 w-10 mb-4 text-primary" />}
              title="Ranking de Jogadores"
              description="Exiba um ranking com os maiores vencedores para engajar a comunidade."
            />
            <FeatureItem
              icon={<Award className="h-10 w-10 mb-4 text-primary" />}
              title="Exibição de Ganhadores"
              description="Mostre os ganhadores de cada partida de forma destacada e automática."
                />
              <FeatureItem
              icon={<Link className="h-10 w-10 mb-4 text-primary" />}
              title="Links de Vendas"
              description="O Vendeor pode gerar um link para venda de cartelas, facilitando as vendas online e presenciais."
            />
              <FeatureItem
              icon={<DollarSign  className="h-10 w-10 mb-4 text-primary" />}
              title="Dashboard Financeiro"
              description="Acompanhe suas finanças com relatórios detalhados e gráficos intuitivos."
            />
              <FeatureItem
              icon={<Landmark  className="h-10 w-10 mb-4 text-primary" />}
              title="Dashboard Interativo para os Jogadores"
              description="Dashboard com informações detalhadas sobre partidas e rifas ativas."
            />            
              
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center my-20">
            <Rocket className="h-12 w-12 mx-auto mb-4 text-primary"/>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Pronto para Lançar seu Negócio de Bingo?</h2>
            <p className="max-w-2xl mx-auto text-lg text-muted-foreground mb-8">
                Entre em contato e tenha sua plataforma funcionando em poucos dias.
            </p>
            <div className="inline-block bg-muted p-6 rounded-lg border">
                <p className="text-2xl font-bold">Jota Dev</p>
  < p className = "text-xl text-muted-foreground" > 91 99629 - 3532 </p>
                  <Button size="lg" onClick={() => window.location.href = 'https://wa.me/5591996293532'}>
            Entre em Contato Agora
          </Button>
            </div>
        </section>

      </div>
       <footer className="text-center p-4 border-t">
            <p className="text-sm text-muted-foreground">Desenvolvido por Jota Dev - 2024</p>
       </footer>
    </div>
  );
}
