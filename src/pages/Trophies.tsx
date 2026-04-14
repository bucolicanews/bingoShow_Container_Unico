import { useNavigate } from 'react-router-dom';
import { useGame } from '@/contexts/GameContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, Calendar, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Win } from '@/types/match';
import PlayerAvatar from '@/components/PlayerAvatar';

const Trophies = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { wins, matches, playerCards } = useGame();

  const getPrizeDisplay = (win: Win) => {
    const prize = win.prize_details;
    if (prize.type === 'product') return `🎁 ${prize.productName || 'Produto'}`;
    if (prize.type === 'fixed') return `💰 ${Number(prize.value).toFixed(2)} cr.`;
    if (prize.type === 'percentage') return `📊 ${prize.value}% do pote`;
    return 'N/A';
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-7 h-7 text-amber-500" />
          Minhas Vitórias
        </h1>
      </div>

      {wins.length === 0 ? (
        <div className="card-container text-center py-20">
          <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h2 className="font-heading text-xl font-bold">Nenhum troféu ainda!</h2>
          <p className="text-muted-foreground mt-2">Participe de mais partidas para começar a colecionar vitórias.</p>
          <Button className="mt-6" onClick={() => navigate('/')}>Voltar ao Lobby</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {wins.map(win => {
            const match = matches.find(m => m.id === win.match_id);
            const card = playerCards.find(c => c.id === win.player_card_id);
            return (
              <div key={win.id} className="card-container p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-l-4 border-amber-500">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <PlayerAvatar url={profile?.avatar_url || null} className="w-12 h-12 border-2 border-amber-500/20 shadow-sm" />
                    <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 border-2 border-background">
                      <Trophy className="w-3 h-3" />
                    </div>
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{match?.name || 'Partida Finalizada'}</p>
                    <p className="text-sm text-muted-foreground">
                      Ganhou: <span className="font-semibold text-success">{getPrizeDisplay(win)}</span>
                    </p>
                  </div>
                </div>
                <div className="text-left sm:text-right w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                   <div className="flex items-center sm:justify-end gap-2 text-xs text-muted-foreground">
                      <Ticket className="w-3 h-3" />
                      <span>Cartela: {card?.name || 'N/A'}</span>
                    </div>
                   <div className="flex items-center sm:justify-end gap-2 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{format(new Date(win.won_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default Trophies;