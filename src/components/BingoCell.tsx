import { cn } from '@/lib/utils';

interface BingoCellProps {
  number: number;
  isMarked: boolean;
  isFreeSpace: boolean;
  onClick?: () => void;
  isNewlyMarked?: boolean;
}

export const BingoCell = ({ number, isMarked, isFreeSpace, onClick, isNewlyMarked }: BingoCellProps) => {
  return (
    <button
      onClick={onClick}
      disabled={isFreeSpace}
      className={cn(
        'bingo-cell',
        isMarked && 'marked',
        isFreeSpace && 'free',
        isNewlyMarked && 'animate-flash'
      )}
    >
      {isFreeSpace ? '★' : number}
    </button>
  );
};