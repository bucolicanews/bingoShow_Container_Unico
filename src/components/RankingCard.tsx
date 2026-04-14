import React from 'react';
import PlayerAvatar from './PlayerAvatar';
import { Trophy, Medal, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RankingCardProps {
  player: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    winCount: number;
  };
  position: number;
}

const RankingCard = ({ player, position }: RankingCardProps) => {
  const isTop3 = position <= 3;
  
  const getMedalColor = (pos: number) => {
    if (pos === 1) return "text-yellow-500";
    if (pos === 2) return "text-slate-400";
    if (pos === 3) return "text-amber-600";
    return "text-muted-foreground";
  };

  return (
    <div className={cn(
      "card-container flex items-center justify-between p-4 transition-all hover:scale-[1.02]",
      position === 1 && "border-2 border-yellow-500/30 bg-yellow-500/5",
      position === 2 && "border-2 border-slate-400/30 bg-slate-400/5",
      position === 3 && "border-2 border-amber-600/30 bg-amber-600/5"
    )}>
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full font-heading font-bold text-sm",
            isTop3 ? "bg-background shadow-sm" : "text-muted-foreground"
          )}>
            {position === 1 ? <Trophy className="h-5 w-5 text-yellow-500" /> : 
             position === 2 ? <Medal className="h-5 w-5 text-slate-400" /> :
             position === 3 ? <Medal className="h-5 w-5 text-amber-600" /> : 
             position}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <PlayerAvatar url={player.avatar_url} fallback={player.full_name || 'J'} />
          <div>
            <p className="font-heading font-bold text-foreground">
              {player.full_name || 'Jogador'}
            </p>
            <p className="text-xs text-muted-foreground">
              ID: ...{player.id.slice(-6).toUpperCase()}
            </p>
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="flex items-center justify-end gap-1 text-primary">
          <Star className="h-4 w-4 fill-current" />
          <span className="font-heading text-xl font-bold">{player.winCount}</span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vitórias</p>
      </div>
    </div>
  );
};

export default RankingCard;