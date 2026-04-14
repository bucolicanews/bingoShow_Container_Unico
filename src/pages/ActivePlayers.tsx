import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '@/contexts/GameContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Flame, Loader2 } from 'lucide-react';
import PlayerAvatar from '@/components/PlayerAvatar';

const ActivePlayers = () => {
  const navigate = useNavigate();
  const { matches, matchCards } = useGame();

  const activePlayerIds = useMemo(() => {
    const activeMatchIds = new Set(matches.filter(m => m.status === 'in_progress' || m.status === 'open').map(m => m.id));
    const ids = new Set<string>();
    matchCards.forEach(mc => {
      if (activeMatchIds.has(mc.match_id)) {
        ids.add(mc.player_id);
      }
    });
    return Array.from(ids);
  }, [matches, matchCards]);

  const { data: activePlayers = [], isLoading } = useQuery({
    queryKey: ['activeProfiles', activePlayerIds],
    queryFn: async () => {
      if (activePlayerIds.length === 0) return [];
      const { data, error } = await supabase.rpc('get_public_profiles', { p_user_ids: activePlayerIds });
      if (error) {
        console.error("Erro ao buscar perfis:", error);
        return [];
      }
      return data || [];
    },
    enabled: activePlayerIds.length > 0,
  });

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-7 h-7 text-accent" />
          Jogadores Ativos
        </h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : activePlayers.length === 0 ? (
        <div className="card-container text-center py-20">
          <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h2 className="font-heading text-xl font-bold">Ninguém jogando agora.</h2>
          <p className="text-muted-foreground mt-2">Seja o primeiro a entrar em uma partida!</p>
          <Button className="mt-6" onClick={() => navigate('/')}>Voltar ao Lobby</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {activePlayers.map((player: any) => (
            <div key={player.id} className="card-container p-4 flex flex-col items-center text-center">
              <PlayerAvatar url={player.avatar_url} />
              <p className="font-bold text-foreground mt-3">{player.full_name || 'Jogador'}</p>
              <div className="flex items-center gap-1 text-xs text-accent mt-1 font-semibold">
                <Flame className="w-3 h-3" />
                <span>Online</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default ActivePlayers;