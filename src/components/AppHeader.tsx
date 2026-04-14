import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGame } from '@/contexts/GameContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Wallet, Plus, Banknote, History, Printer, LogOut, Star, Crown, Ticket, Search, UserCheck, ShieldCheck, User, AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { CreditRequestDialog } from './CreditRequestDialog';
import { MyCreditRequestsDialog } from './MyCreditRequestsDialog';
import { RedeemRequestDialog } from './RedeemRequestDialog';
import { MyRedeemRequestsDialog } from './MyRedeemRequestsDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

export const AppHeader = () => {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { gameSettings, playerCards, rechargeFakeCredits, players } = useGame();
  const queryClient = useQueryClient();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isRecharging, setIsRecharging] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  useEffect(() => {
    if (!profile?.avatar_url) { setAvatarSrc(null); return; }
    supabase.storage.from('avatars').download(profile.avatar_url).then(({ data, error }) => {
      if (error || !data) return;
      setAvatarSrc(URL.createObjectURL(data));
    });
  }, [profile?.avatar_url]);

  if (!profile) {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
        <div className="container max-w-6xl mx-auto flex min-h-16 items-center justify-between px-3 py-2 sm:px-4 sm:py-0">
          <div className="flex shrink-0 flex-col items-start">
            <a href="/" className="font-heading text-xl font-bold text-foreground sm:text-2xl">
              🎱 Bingo
            </a>
            <Button variant="ghost" size="sm" onClick={handleGoBack} className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Voltar
            </Button>
          </div>
          <Button onClick={() => navigate('/login')} className="gradient-primary shadow-sm font-bold">
            Entrar / Cadastrar
          </Button>
        </div>
      </header>
    );
  }

  const myOwnedCards = playerCards.filter(c => c.player_id === profile.id);

  const roleBadge = {
    admin: { label: 'Admin', className: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30' },
    vendedor: { label: 'Vendedor', className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30' },
    user: { label: 'Usuário', className: 'bg-muted text-muted-foreground border-border' },
  }[profile.role] ?? { label: profile.role, className: '' };

  const handleRechargeFake = async () => {
    setIsRecharging(true);
    const success = await rechargeFakeCredits();
    if (success) {
      toast.success('Você recebeu +1000 créditos de brincar!');
    }
    setIsRecharging(false);
  };

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      // Invalidar todas as queries para forçar recarregamento dos dados
      await queryClient.invalidateQueries();
      toast.success('Dados atualizados com sucesso!');
    } catch (error) {
      toast.error('Erro ao atualizar dados');
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAdmin = profile.role === 'admin';

  // Lógica de Segurança do Caixa do Admin
  const totalUserCredits = useMemo(() => {
    if (!isAdmin || !players) return 0;
    return players.reduce((acc, player) => acc + Number(player.credits || 0), 0);
  }, [players, isAdmin]);

  const adminCaixa = Number(gameSettings?.admin_profit || 0);
  const isCaixaBaixo = adminCaixa < totalUserCredits;

  const menuItems = [
    ...(!isAdmin ? [{
      dialog: <CreditRequestDialog gameSettings={gameSettings}><Button variant="ghost" className="w-full justify-start text-base py-6"><Plus className="w-5 h-5 mr-4" />Solicitar Créditos</Button></CreditRequestDialog>,
    }] : []),
    ...(!isAdmin ? [{
      dialog: <RedeemRequestDialog><Button variant="ghost" className="w-full justify-start text-base py-6"><Banknote className="w-5 h-5 mr-4" />Resgatar Créditos</Button></RedeemRequestDialog>,
    }] : []),
    ...(!isAdmin ? [{
      dialog: <MyCreditRequestsDialog><Button variant="ghost" className="w-full justify-start text-base py-6"><History className="w-5 h-5 mr-4" />Histórico de Créditos</Button></MyCreditRequestsDialog>,
    }] : []),
    ...(!isAdmin ? [{
      dialog: <MyRedeemRequestsDialog><Button variant="ghost" className="w-full justify-start text-base py-6"><Banknote className="w-5 h-5 mr-4" />Meus Resgates</Button></MyRedeemRequestsDialog>,
    }] : []),
    {
      action: () => navigate('/ranking'),
      label: 'Hall da Fama (Ranking)',
      icon: Crown,
    },
    {
      action: () => navigate('/rifas'),
      label: 'Rifas',
      icon: Ticket,
    },
    {
      action: () => navigate('/validar-cartela'),
      label: 'Validar Cartelas / Auditoria',
      icon: Search,
    },
    ...(profile.role === 'vendedor' ? [{
      action: () => navigate('/vendedor/painel'),
      label: 'Painel do Vendedor',
      icon: UserCheck,
    }] : []),
    ...(!isAdmin && profile.role !== 'vendedor' ? [{
      action: () => navigate('/solicitar-vendedor'),
      label: 'Ser Vendedor de Rifas',
      icon: UserCheck,
    }] : []),
    ...(isAdmin ? [{
      action: () => navigate('/admin'),
      label: 'Painel Admin',
      icon: ShieldCheck,
    }] : []),
    ...(!isAdmin ? [{
      action: () => navigate('/print'),
      label: 'Imprimir Cartelas',
      icon: Printer,
      disabled: myOwnedCards.length === 0,
    }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
      <div className="container max-w-6xl mx-auto px-3 sm:px-4">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 sm:h-16 sm:flex-nowrap sm:py-0">
        <div className="flex shrink-0 flex-col items-start">
          <a href="/" className="font-heading text-xl font-bold text-foreground sm:text-2xl">
            🎱 Bingo
          </a>
          <Button variant="ghost" size="sm" onClick={handleGoBack} className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Voltar
          </Button>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap sm:gap-2">
          
          {/* Visão do Admin: Caixa vs Saldo Jogadores */}
          {isAdmin && (
            <div 
              className={cn(
                "flex max-w-full shrink items-center gap-1.5 rounded-full border px-2 py-1 text-xs cursor-help transition-colors sm:px-3 sm:text-sm",
                isCaixaBaixo 
                  ? "bg-destructive/10 border-destructive text-destructive" 
                  : "bg-success/10 border-success/30 text-success"
              )}
              title={`Caixa Admin: ${adminCaixa.toFixed(2)} cr.\nSaldo Total dos Jogadores: ${totalUserCredits.toFixed(2)} cr.\n\n${isCaixaBaixo ? 'Atenção: Os jogadores possuem mais saldo do que o caixa acumulado do sistema!' : 'Caixa Saudável.'}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="font-heading font-bold tabular-nums text-xs sm:text-base">
                {adminCaixa.toFixed(2)}
              </span>
              {isCaixaBaixo && (
                <AlertTriangle className="w-4 h-4 ml-1 animate-pulse" />
              )}
            </div>
          )}

          {/* Saldo Real (Apenas para Usuários/Vendedores) */}
          {!isAdmin && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-1.5 sm:px-3" title="Créditos Reais">
              <Wallet className="w-3.5 h-3.5 text-foreground" />
              <span className="font-heading font-bold tabular-nums text-xs text-foreground sm:text-base">{Number(profile.credits || 0).toFixed(2)}</span>
            </div>
          )}
          
          {/* Saldo de Brincar com Botão de Recarga (Apenas para Usuários/Vendedores) */}
          {!isAdmin && (
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 pl-2 pr-1 py-1 sm:pl-3" title="Créditos de Brincar">
              <Star className="w-3.5 h-3.5 text-amber-600" />
              <span className="mr-1 font-heading font-bold tabular-nums text-xs text-amber-600 sm:text-base">{Number(profile.fake_credits || 0).toFixed(2)}</span>
              <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 shrink-0 rounded-full text-amber-600 hover:bg-amber-400/20"
                  onClick={handleRechargeFake}
                  disabled={isRecharging}
              >
                  <Plus className={`w-3 h-3 ${isRecharging ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          )}

          {/* Botão de Refresh */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full hover:bg-muted"
            onClick={handleRefreshData}
            disabled={isRefreshing}
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>

          <button
            onClick={() => navigate('/account')}
            className="ml-1 flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80 sm:ml-2"
            title="Meu perfil"
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="avatar" className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <span className={`hidden rounded-full border px-1.5 py-0 text-[9px] font-bold sm:inline-flex ${roleBadge.className}`}>
              {roleBadge.label}
            </span>
          </button>
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="shrink-0">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[300px] sm:w-[400px] flex flex-col">
              <SheetHeader>
                <SheetTitle className="font-heading">Menu</SheetTitle>
              </SheetHeader>
              <div className="flex items-center gap-3 px-1 py-3 border-b">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="avatar" className="w-12 h-12 rounded-full object-cover border-2 border-border shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center border-2 border-border shrink-0">
                    <User className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{profile.full_name || 'Usuário'}</p>
                  <Badge className={`text-[10px] mt-0.5 ${roleBadge.className}`}>{roleBadge.label}</Badge>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-1 py-2">
                  {menuItems.map((item, index) => (
                    item.dialog ? (
                      <div key={index}>{item.dialog}</div>
                    ) : (
                      <Button
                        key={index}
                        variant="ghost"
                        className="w-full justify-start text-base py-6"
                        onClick={() => { item.action(); setIsSheetOpen(false); }}
                        disabled={item.disabled}
                      >
                        <item.icon className="w-5 h-5 mr-4" />
                        {item.label}
                      </Button>
                    )
                  ))}
                </div>
              </div>
              <div className="border-t pt-2 pb-6">
                <Button variant="ghost" className="w-full justify-start text-base py-6 text-destructive" onClick={signOut}>
                  <LogOut className="w-5 h-5 mr-4" />
                  Sair
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        </div>
      </div>
    </header>
  );
};