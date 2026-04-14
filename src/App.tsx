import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { GameProvider } from "@/contexts/GameContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Lobby from "./pages/Lobby";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import UpdatePassword from "./pages/UpdatePassword";
import Account from "./pages/Account";
import MatchView from "./pages/MatchView";
import PrintView from "./pages/PrintView";
import NotFound from "./pages/NotFound";
import PlayersAdmin from "./pages/PlayersAdmin";
import CreditRequestsAdmin from "./pages/CreditRequestsAdmin";
import RedeemRequestsAdmin from "./pages/RedeemRequestsAdmin";
import ActivePlayers from "./pages/ActivePlayers";
import Trophies from "./pages/Trophies";
import Ranking from "./pages/Ranking";
import Rifas from "./pages/Rifas";
import RifaView from "./pages/RifaView";
import RifasAdmin from "./pages/admin/RifasAdmin";
import RifaDetalheAdmin from "./pages/admin/RifaDetalheAdmin";
import VendedorRifa from "./pages/VendedorRifa";
import VendedorCartelas from "./pages/VendedorCartelas";
import ValidarCartela from "./pages/ValidarCartela";
import SolicitarVendedor from "./pages/SolicitarVendedor";
import VendedorPainel from "./pages/VendedorPainel";
import VendedoresAdmin from "./pages/admin/VendedoresAdmin";
import VendedorPerfilPublico from "./pages/VendedorPerfilPublico";
import VendedorImprimirBingo from "./pages/VendedorImprimirBingo";
import VendedorImprimirRifa from "./pages/VendedorImprimirRifa";
import PagarCartela from "./pages/PagarCartela";
import LandingPage from "./pages/Landing";
import { Loader2 } from "lucide-react";
import ConviteBingoPage from "./pages/pageConvite";
import Support from "./pages/Support";

const queryClient = new QueryClient();

// Componente para lidar com eventos globais do Supabase Auth
const AuthEventsHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // 1. Escuta mudanças de estado (evento disparado pelo link do e-mail)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/update-password');
      }
    });

    // 2. Verificação imediata via URL (caso o evento demore ou falhe)
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      navigate('/update-password');
    }

    return () => subscription.unsubscribe();
  }, [navigate]);

  return null;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Se estiver no meio de uma recuperação de senha, não redireciona para o login
  const isRecovery = window.location.hash.includes('type=recovery');
  
  if (!session && !isRecovery) {
    return <Navigate to="/login" replace />;
  }
  
  return <Layout>{children}</Layout>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <RealtimeProvider>
          <AuthProvider>
            <GameProvider>
              <AuthEventsHandler />
              <Toaster />
              <Sonner />
              <Routes>
                <Route path="/login" element={<Login />} />
              <Route path="/update-password" element={<UpdatePassword />} />
              
              {/* Rotas Públicas */ }
              <Route path="/venda" element={<LandingPage />} />
              <Route path="/" element={<Layout><Lobby /></Layout>} />
              <Route path="/active-players" element={<Layout><ActivePlayers /></Layout>} />
              <Route path="/ranking" element={<Layout><Ranking /></Layout>} />
              <Route path="/rifas" element={<Layout><Rifas /></Layout>} />
              <Route path="/rifas/:id" element={<Layout><RifaView /></Layout>} />
              <Route path="/vendedor/perfil/:codigo" element={<VendedorPerfilPublico />} />
              <Route path="/validar-cartela" element={<Layout><ValidarCartela /></Layout>} />
              <Route path="/pagar-cartela" element={<Layout><PagarCartela /></Layout>} />
              <Route path="/convite-bingo" element={<Layout><ConviteBingoPage /></Layout>} />
              <Route path="/suporte" element={<Layout><Support /></Layout>} />
              
              {/* Rotas Privadas */}
              <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/admin/players" element={<ProtectedRoute><PlayersAdmin /></ProtectedRoute>} />
              <Route path="/admin/credit-requests" element={<ProtectedRoute><CreditRequestsAdmin /></ProtectedRoute>} />
              <Route path="/admin/redeem-requests" element={<ProtectedRoute><RedeemRequestsAdmin /></ProtectedRoute>} />
              <Route path="/match/:id" element={<ProtectedRoute><MatchView /></ProtectedRoute>} />
              <Route path="/print" element={<ProtectedRoute><PrintView /></ProtectedRoute>} />
              <Route path="/trophies" element={<ProtectedRoute><Trophies /></ProtectedRoute>} />
              <Route path="/admin/rifas" element={<ProtectedRoute><RifasAdmin /></ProtectedRoute>} />
              <Route path="/admin/rifas/:id" element={<ProtectedRoute><RifaDetalheAdmin /></ProtectedRoute>} />
              <Route path="/vendedor" element={<ProtectedRoute><VendedorRifa /></ProtectedRoute>} />
              <Route path="/vendedor/cartelas/:compraId" element={<ProtectedRoute><VendedorCartelas /></ProtectedRoute>} />
              <Route path="/vendedor/imprimir/:rifaId" element={<ProtectedRoute><VendedorCartelas /></ProtectedRoute>} />
              <Route path="/vendedor/painel" element={<ProtectedRoute><VendedorPainel /></ProtectedRoute>} />
              <Route path="/solicitar-vendedor" element={<ProtectedRoute><SolicitarVendedor /></ProtectedRoute>} />
              <Route path="/admin/vendedores" element={<ProtectedRoute><VendedoresAdmin /></ProtectedRoute>} />
              <Route path="/vendedor/imprimir-bingo/:folhaId" element={<ProtectedRoute><VendedorImprimirBingo /></ProtectedRoute>} />
              <Route path="/vendedor/imprimir-rifa/:compraId" element={<ProtectedRoute><VendedorImprimirRifa /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </GameProvider>
        </AuthProvider>
      </RealtimeProvider>
    </BrowserRouter>
  </TooltipProvider>
</QueryClientProvider>
);

export default App;