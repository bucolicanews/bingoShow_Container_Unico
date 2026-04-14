import { Match, MatchCard } from '@/types/match';
import { calculateNumbersToWin } from '@/utils/bingoUtils';
import { Ticket, Trophy, Flame, Target, Star, Coins, Gift } from 'lucide-react';
import { Badge } from './ui/badge';

interface MatchStatsProps {
  match: Match;
  allMatchCards: MatchCard[];
}

const getPrizeDisplay = (match: Match) => {
  if (match.prize.type === 'product') return `🎁 ${match.prize.productName || 'Produto'}`;
  if (match.prize.type === 'fixed') return `💰 ${Number(match.prize.value || 0).toFixed(2)} cr.`;
  if (match.prize.type === 'percentage') return `📊 ${match.prize.value}% (${Number(match.pot * (match.prize.value || 0) / 100).toFixed(2)} cr.)`;
  return 'N/A';
};

export const MatchStats = ({ match, allMatchCards }: MatchStatsProps) => {
  const totalCards = allMatchCards.length;
  const realCardsCount = allMatchCards.filter(c => c.credit_type === 'real').length;
  const fakeCardsCount = allMatchCards.filter(c => c.credit_type === 'fake').length;
  const prizeDisplay = getPrizeDisplay(match);

  const stats = { missing5: 0, missing3: 0, missing1: 0 };

  if (match.status === 'in_progress') {
    for (const card of allMatchCards) {
      const needed = calculateNumbersToWin(card, match.game_type);
      if (needed <= 1) stats.missing1++;
      else if (needed <= 3) stats.missing3++;
      else if (needed <= 5) stats.missing5++;
    }
  }

  return (
    <div className="card-container mb-6 overflow-hidden relative">
      {match.is_festival && (
         <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm z-10 flex items-center gap-1">
             <Gift className="w-3 h-3" /> Festival: Rodada {(match.current_round || 0) + 1} de {match.prizes?.length || 1}
         </div>
      )}

      {match.prize.type === 'product' && match.prize_image_url && (
        <div className="mx-[-1rem] mt-[-1rem] mb-4">
          <img src={match.prize_image_url} alt={match.prize.productName || 'Prêmio'} className="w-full h-32 md:h-40 object-cover" />
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-2 sm:gap-4 text-center mt-2">
        <div className="flex flex-col items-center justify-center p-2 sm:p-4 rounded-lg bg-muted/50 border border-border/50">
          <Ticket className="w-4 h-4 sm:w-6 sm:h-6 text-primary mb-1" />
          <span className="font-bold text-lg sm:text-2xl font-heading">{totalCards}</span>
          <span className="text-[10px] sm:text-sm text-muted-foreground">Cartelas em Jogo</span>
        </div>
        <div className="flex flex-col items-center justify-center p-2 sm:p-4 rounded-lg bg-muted/50 border border-border/50">
          <Trophy className="w-4 h-4 sm:w-6 sm:h-6 text-success mb-1" />
          <span className="font-bold text-sm sm:text-lg font-heading leading-tight">{prizeDisplay}</span>
          <span className="text-[10px] sm:text-sm text-muted-foreground">Prêmio em Disputa</span>
        </div>
      </div>

      {match.status === 'in_progress' && (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-center font-heading font-bold mb-3 text-sm sm:text-base text-foreground">Quase lá!</h4>
          
          <div className="grid grid-cols-3 gap-1.5 sm:gap-4 text-center">
            <div className="flex flex-col items-center justify-center p-2 sm:p-4 rounded-lg bg-muted/50 border border-border/50">
              <Target className="w-4 h-4 sm:w-6 sm:h-6 text-muted-foreground mb-1" />
              <span className="font-bold text-lg sm:text-2xl font-heading">{stats.missing5}</span>
              <span className="text-[9px] sm:text-sm text-muted-foreground">Faltam 5</span>
            </div>
            <div className="flex flex-col items-center justify-center p-2 sm:p-4 rounded-lg bg-accent/10 border border-accent/20">
              <Target className="w-4 h-4 text-accent mb-1" />
              <span className="font-bold text-lg font-heading text-accent">{stats.missing3}</span>
              <span className="text-[9px] sm:text-sm text-accent/80">Faltam 3</span>
            </div>
            <div className="flex flex-col items-center justify-center p-2 sm:p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <Flame className="w-4 h-4 text-destructive mb-1" />
              <span className="font-bold text-lg font-heading text-destructive">{stats.missing1}</span>
              <span className="text-[9px] sm:text-sm text-destructive/80">Por 1!</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};