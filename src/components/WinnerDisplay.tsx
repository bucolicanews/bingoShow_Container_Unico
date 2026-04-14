import { Match, Winner } from '@/types/match';
import { MatchCard } from '@/types/match';
import { Trophy } from 'lucide-react';
import { BingoCell } from './BingoCell';
import { gameTypeLabels } from '@/utils/bingoUtils';

interface WinnerDisplayProps {
  match: Match;
  allMatchCards: MatchCard[];
}

export const WinnerDisplay = ({ match, allMatchCards }: WinnerDisplayProps) => {
  if (match.status !== 'finished' || !match.winners || match.winners.length === 0) {
    return null;
  }

  return (
    <div className="card-container text-center mb-8 bg-success/10 border-2 border-success shadow-lg animate-bounce-in relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute -top-10 -left-10 w-32 h-32 bg-success/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-success/20 rounded-full blur-3xl" />

      <Trophy className="w-16 h-16 text-success mx-auto mb-2 animate-pulse drop-shadow-sm" />
      <h3 className="font-heading text-4xl font-black text-success uppercase tracking-widest drop-shadow-sm">
        BINGO!
      </h3>
      <p className="text-foreground mt-2 font-medium">A partida foi encerrada. Parabéns ao(s) vencedor(es)!</p>
      
      <div className="mt-8 space-y-8 relative z-10">
        {match.winners.map((winner: Winner) => {
          // Busca a cartela atualizada pelo estado (allMatchCards), ou usa os dados "congelados" salvos dentro do winner
          const stateCard = allMatchCards.find(c => c.id === winner.cardId);
          const cardNumbers = stateCard?.numbers || winner.numbers;
          const markedNumbers = stateCard ? stateCard.marked_numbers : new Set(winner.markedNumbers || []);

          const hasCardData = !!cardNumbers;

          return (
            <div key={winner.cardId} className="bg-background rounded-2xl p-5 border border-success/30 shadow-md relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-success/40 via-success to-success/40" />
              
              <p className="font-heading text-2xl font-bold text-foreground">
                {winner.playerName}
              </p>
              <p className="text-sm text-muted-foreground mb-5">
                ganhou com a cartela <strong className="text-foreground">"{winner.cardName}"</strong> ({gameTypeLabels[match.game_type]})
              </p>
              
              {hasCardData && (
                <div className="max-w-xs mx-auto">
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2 p-2.5 bg-muted/40 rounded-xl border border-border shadow-inner">
                    {['B', 'I', 'N', 'G', 'O'].map(letter => (
                      <div key={letter} className="w-full aspect-square rounded-lg flex items-center justify-center text-sm sm:text-base font-heading font-black bg-success text-success-foreground shadow-sm">
                        {letter}
                      </div>
                    ))}
                    {cardNumbers.flat().map((num: number, i: number) => {
                      const isFree = i === 12;
                      const isMarked = isFree || (markedNumbers instanceof Set ? markedNumbers.has(num) : Array.isArray(markedNumbers) && markedNumbers.includes(num));
                      
                      return (
                        <BingoCell
                          key={`${winner.cardId}-${i}`}
                          number={num}
                          isMarked={isMarked}
                          isFreeSpace={isFree}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};