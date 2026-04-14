import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowRight, Users, ShieldCheck, Coins, Ticket, SmartphoneNfc } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGame } from '@/contexts/GameContext';
import { useRifaAdmin } from '@/hooks/useRifaAdmin';
import MatchManager from '@/components/admin/MatchManager';
import SettingsManager from '@/components/admin/SettingsManager';
import VendedoresAdmin from './admin/VendedoresAdmin';
import FinanceiroAdmin from './admin/FinanceiroAdmin';
import { cn } from '@/lib/utils';

const Admin = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { allCreditRequests, allRedeemRequests, players, gameSettings } = useGame();
  const { solicitacoesVendedor, todasFolhasBingo, todasCompras, acertosPendentes } = useRifaAdmin();

  const [activeTab, setActiveTab] = useState('matches');

  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      navigate('/');
    }
  }, [profile, navigate]);

  const totalUserCredits = useMemo(() => {
    return (players || []).reduce((acc, player) => acc + Number(player.credits || 0), 0);
  }, [players]);

  const adminProfit = Number(gameSettings?.admin_profit || 0);
  const totalCredits = totalUserCredits + adminProfit;

  if (!profile || profile.role !== 'admin') {
    return null;
  }

  // Lógica de Notificações
  const pendingRequestsCount = (allCreditRequests || []).filter(r => r.status === 'pending').length;
  const pendingAcertosCount = acertosPendentes.filter(a => a.status === 'pendente' || a.status === 'em_analise').length;
  const totalEntradasPendentes = pendingRequestsCount + pendingAcertosCount;

  const pendingRedeemsCount = (allRedeemRequests || []).filter(r => r.status === 'pending').length;
  
  // Vendedores
  const pendingVendedoresCount = solicitacoesVendedor.filter(s => s.status === 'pendente').length;
  const pendingPixClientesCount = todasFolhasBingo.filter(f => f.status === 'em_analise').length + todasCompras.filter(c => c.status === 'em_analise').length;
  const totalVendedoresPendencies = pendingVendedoresCount + pendingPixClientesCount;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Painel Admin</h1>
      </div>

      {/* Alerta de Pagamento Direto de Cliente */}
      {pendingPixClientesCount > 0 && (
        <div 
            className="card-container bg-blue-50 hover:bg-blue-100 transition-colors border-2 border-blue-200 mb-6 p-4 flex items-center justify-between animate-pulse cursor-pointer"
            onClick={() => setActiveTab('vendedores')}
        >
          <div className="flex items-center gap-3 text-blue-700">
            <SmartphoneNfc className="w-8 h-8" />
            <div>
              <p className="font-bold">Atenção: Pagamento de Cliente via PIX</p>
              <p className="text-xs">Existem {pendingPixClientesCount} comprovante(s) enviado(s) por clientes para você conferir.</p>
            </div>
          </div>
          <p className="text-[10px] font-black uppercase bg-blue-600 text-white px-2 py-1 rounded hidden sm:block">Clique para abrir a aba Vendas</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card-container p-4">
          <div className="flex items-center text-muted-foreground mb-2">
            <Users className="w-4 h-4 mr-2" />
            <h3 className="text-sm font-semibold">Saldo Jogadores</h3>
          </div>
          <p className="text-2xl font-bold font-heading">{totalUserCredits.toFixed(2)} cr.</p>
        </div>
        <div className="card-container p-4">
          <div className="flex items-center text-muted-foreground mb-2">
            <ShieldCheck className="w-4 h-4 mr-2" />
            <h3 className="text-sm font-semibold">Caixa Admin</h3>
          </div>
          <p className="text-2xl font-bold font-heading text-success">{adminProfit.toFixed(2)} cr.</p>
        </div>
        <div className="card-container p-4">
          <div className="flex items-center text-muted-foreground mb-2">
            <Coins className="w-4 h-4 mr-2" />
            <h3 className="text-sm font-semibold">Total em Jogo</h3>
          </div>
          <p className="text-2xl font-bold font-heading text-primary">{totalCredits.toFixed(2)} cr.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 mb-8 bg-muted p-1 rounded-lg">
          <TabsTrigger value="matches" className="flex-1 py-3 min-w-[80px]">Partidas</TabsTrigger>
          <TabsTrigger value="credits" className="flex-1 py-3 min-w-[80px] relative">
            Entradas
            {totalEntradasPendentes > 0 && <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white border border-background">{totalEntradasPendentes}</span>}
          </TabsTrigger>
          <TabsTrigger value="redeems" className="flex-1 py-3 min-w-[80px] relative">
            Saídas
            {pendingRedeemsCount > 0 && <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white border border-background">{pendingRedeemsCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="players" className="flex-1 py-3 min-w-[80px]">Jogadores</TabsTrigger>
          <TabsTrigger value="rifas" className="flex-1 py-3 min-w-[80px]">Rifas</TabsTrigger>
          <TabsTrigger value="vendedores" className="flex-1 py-3 min-w-[80px] relative">
            Vendas / Validar
            {totalVendedoresPendencies > 0 && (
              <span className={cn(
                "absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white border border-background",
                pendingPixClientesCount > 0 ? "bg-blue-600 animate-bounce" : "bg-amber-500"
              )}>
                {totalVendedoresPendencies}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="flex-1 py-3 min-w-[80px]">Financeiro</TabsTrigger>
          <TabsTrigger value="settings" className="flex-1 py-3 min-w-[80px]">Ajustes</TabsTrigger>
        </TabsList>

        <TabsContent value="matches">
          <MatchManager />
        </TabsContent>

        <TabsContent value="credits">
          <div className="card-container">
            <h2 className="font-heading text-xl font-bold text-foreground mb-4">Gerenciar Entradas</h2>
            <p className="text-muted-foreground mb-6">Aprovação de comprovantes (PIX), acertos de vendedores e liberação de créditos.</p>
            <Button className="w-full py-6 text-lg gradient-primary" onClick={() => navigate('/admin/credit-requests')}>Ver Entradas <ArrowRight className="w-5 h-5 ml-2" /></Button>
          </div>
        </TabsContent>

        <TabsContent value="redeems">
          <div className="card-container">
            <h2 className="font-heading text-xl font-bold text-foreground mb-4">Solicitações de Resgate (Saída)</h2>
            <p className="text-muted-foreground mb-6">Pagamento de prêmios e créditos aos jogadores via PIX.</p>
            <Button className="w-full py-6 text-lg gradient-primary" onClick={() => navigate('/admin/redeem-requests')}>Gerenciar Resgates <ArrowRight className="w-5 h-5 ml-2" /></Button>
          </div>
        </TabsContent>

        <TabsContent value="players">
          <div className="card-container">
            <h2 className="font-heading text-xl font-bold text-foreground mb-4">Base de Jogadores</h2>
            <p className="text-muted-foreground mb-6">Visualize detalhes de perfis e ajuste saldos manualmente.</p>
            <Button className="w-full py-6 text-lg" variant="outline" onClick={() => navigate('/admin/players')}>Gerenciar Jogadores <ArrowRight className="w-5 h-5 ml-2" /></Button>
          </div>
        </TabsContent>

        <TabsContent value="rifas">
          <div className="card-container">
            <h2 className="font-heading text-xl font-bold text-foreground mb-4 flex items-center gap-2"><Ticket className="w-5 h-5" />Módulo de Rifas</h2>
            <p className="text-muted-foreground mb-6">Crie e gerencie rifas, vendedores e registre vendas físicas.</p>
            <Button className="w-full py-6 text-lg gradient-primary" onClick={() => navigate('/admin/rifas')}>Gerenciar Rifas <ArrowRight className="w-5 h-5 ml-2" /></Button>
          </div>
        </TabsContent>

        <TabsContent value="vendedores">
          <VendedoresAdmin />
        </TabsContent>

        <TabsContent value="financeiro">
          <FinanceiroAdmin />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsManager />
        </TabsContent>
      </Tabs>
    </>
  );
};

export default Admin;