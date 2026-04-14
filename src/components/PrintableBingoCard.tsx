import { PlayerCard } from '@/types/match';
import { cn } from '@/lib/utils';

interface PrintableBingoCardProps {
  card: PlayerCard;
}

const headerColors = [
  'bg-primary text-primary-foreground',
  'bg-destructive text-destructive-foreground',
  'bg-secondary text-secondary-foreground',
  'bg-success text-success-foreground',
  'bg-accent text-accent-foreground',
];

export const PrintableBingoCard = ({ card }: PrintableBingoCardProps) => {
  return (
    <div className="w-[20rem] p-3 flex flex-col break-inside-avoid bg-card shadow-lg rounded-lg border-2 border-border">
      <h2 className="text-center text-3xl font-bold mb-3 text-foreground font-heading">{card.name}</h2>
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr>
            {['B', 'I', 'N', 'G', 'O'].map((letter, colIndex) => (
              <th
                key={letter}
                className={cn(
                  "w-1/5 h-16 text-4xl font-bold border-2 border-border",
                  headerColors[colIndex]
                )}
              >
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {card.numbers.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((num, colIndex) => (
                <td
                  key={`${rowIndex}-${colIndex}`}
                  className={cn(
                    "h-16 text-center border-2 border-border text-3xl font-bold text-foreground",
                    rowIndex === 2 && colIndex === 2 && 'bg-muted'
                  )}
                >
                  {rowIndex === 2 && colIndex === 2 ? '★' : num}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};