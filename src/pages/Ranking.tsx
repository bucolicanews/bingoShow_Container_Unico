import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, Crown, Loader2 } from 'lucide-react';
import RankingCard from '@/components/RankingCard';

const Ranking = () => {
  const navigate = useNavigate();

  // Busca o ranking através da função SQL get_leaderboard que você criou
  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_leaderboard');
      if (error) {
        console.error("Erro ao buscar ranking:", error);
        return [];
      }
      return data.map((p: any) => ({ ...p, winCount: Number(p.win_count) }));
    }
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold md:text-3xl">
          <Crown className="h-8 w-8 text-yellow-500" />
          Hall da Fama
        </h1>
      </div>

      <div className="card-container bg-gradient-to-br from-yellow-500/10 to-amber-500/10 p-6 text-center border-yellow-500/20">
        <Trophy className="mx-auto h-12 w-12 text-yellow-500 mb-2" />
        <h2 className="font-heading text-xl font-bold">Os Maiores Ganhadores</h2>
        <p className="text-sm text-muted-foreground">Veja quem são as lendas do nosso Bingo!</p>
      </div>

      {leaderboard.length === 0 ? (
        <div className="card-container py-20 text-center">
          <p className="text-muted-foreground">Ainda não temos vencedores registrados. Seja o primeiro!</p>
          <Button className="mt-4" onClick={() => navigate('/')}>Ir para o Lobby</Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {leaderboard.map((player: any, index: number) => (
            <RankingCard 
              key={player.id} 
              player={player} 
              position={index + 1} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Ranking;