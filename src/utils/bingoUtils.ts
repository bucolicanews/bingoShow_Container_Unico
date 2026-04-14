import { BingoCard, GameType, WinResult } from '@/types/bingo';
import { MatchCard } from '@/types/match';

export const generateBingoCard = (): number[][] => {
  const grid: number[][] = Array(5).fill(0).map(() => Array(5).fill(0));
  const ranges = [
    { min: 1, max: 15, count: 5 },  // B
    { min: 16, max: 30, count: 5 }, // I
    { min: 31, max: 45, count: 4 }, // N
    { min: 46, max: 60, count: 5 }, // G
    { min: 61, max: 75, count: 5 }, // O
  ];

  const columns = ranges.map(range => {
    const available = Array.from({ length: range.max - range.min + 1 }, (_, i) => i + range.min);
    const columnNumbers: number[] = [];
    for (let i = 0; i < range.count; i++) {
      const randomIndex = Math.floor(Math.random() * available.length);
      columnNumbers.push(available.splice(randomIndex, 1)[0]);
    }
    return columnNumbers;
  });

  for (let row = 0; row < 5; row++) {
    grid[row][0] = columns[0][row];
    grid[row][1] = columns[1][row];
    if (row < 2) grid[row][2] = columns[2][row];
    else if (row > 2) grid[row][2] = columns[2][row - 1];
    grid[row][3] = columns[3][row];
    grid[row][4] = columns[4][row];
  }
  grid[2][2] = 0; 
  return grid;
};

export const generateCardId = (): string => `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const isCellMarked = (card: BingoCard, row: number, col: number): boolean => {
  const num = Number(card.numbers[row][col]);
  if (num === 0) return true; // O espaço do meio (free space) é 0 e está sempre marcado
  return card.markedNumbers.has(num);
};

export const checkHorizontalWin = (card: BingoCard): number[] | null => {
  for (let row = 0; row < 5; row++) {
    let allMarked = true;
    for (let col = 0; col < 5; col++) {
      if (!isCellMarked(card, row, col)) { allMarked = false; break; }
    }
    if (allMarked) return card.numbers[row].map(Number);
  }
  return null;
};

export const checkVerticalWin = (card: BingoCard): number[] | null => {
  for (let col = 0; col < 5; col++) {
    let allMarked = true;
    for (let row = 0; row < 5; row++) {
      if (!isCellMarked(card, row, col)) { allMarked = false; break; }
    }
    if (allMarked) return card.numbers.map(r => Number(r[col]));
  }
  return null;
};

export const checkDiagonalWin = (card: BingoCard): number[] | null => {
  let mainDiag = true;
  for (let i = 0; i < 5; i++) { if (!isCellMarked(card, i, i)) { mainDiag = false; break; } }
  if (mainDiag) return [0, 1, 2, 3, 4].map(i => Number(card.numbers[i][i]));
  let antiDiag = true;
  for (let i = 0; i < 5; i++) { if (!isCellMarked(card, i, 4 - i)) { antiDiag = false; break; } }
  if (antiDiag) return [0, 1, 2, 3, 4].map(i => Number(card.numbers[i][4 - i]));
  return null;
};

export const checkFullCardWin = (card: BingoCard): number[] | null => {
  const allNumbers: number[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (!isCellMarked(card, row, col)) return null;
      if (Number(card.numbers[row][col]) !== 0) allNumbers.push(Number(card.numbers[row][col]));
    }
  }
  return allNumbers;
};

export const checkWin = (card: BingoCard, gameType: GameType): WinResult | null => {
  let winningNumbers: number[] | null = null;
  const type = String(gameType).toLowerCase().trim() as GameType;
  
  switch (type) {
    case 'horizontal': 
      winningNumbers = checkHorizontalWin(card); 
      break;
    case 'vertical': 
      winningNumbers = checkVerticalWin(card); 
      break;
    case 'diagonal': 
      // No modo "Diagonal (D-V-H)", qualquer linha ganha
      winningNumbers = checkHorizontalWin(card) || checkVerticalWin(card) || checkDiagonalWin(card);
      break;
    case 'full': 
      winningNumbers = checkFullCardWin(card); 
      break;
  }
  
  return winningNumbers ? { cardId: card.id, cardName: card.name, type, winningNumbers } : null;
};

export const calculateNumbersToWin = (card: MatchCard, gameType: GameType): number => {
  const { numbers, marked_numbers } = card;
  const tempCard: BingoCard = { id: card.id, name: card.name, numbers, markedNumbers: new Set(Array.from(marked_numbers).map(Number)) };
  const type = String(gameType).toLowerCase().trim() as GameType;

  switch (type) {
    case 'full':
        let needed = 0;
        for (let r = 0; r < 5; r++) 
            for (let c = 0; c < 5; c++) 
                if (!isCellMarked(tempCard, r, c)) needed++;
        return needed;
    case 'horizontal':
      let minH = 5;
      for (let r = 0; r < 5; r++) {
        let n = 0;
        for (let c = 0; c < 5; c++) if (!isCellMarked(tempCard, r, c)) n++;
        minH = Math.min(minH, n);
      }
      return minH;
    case 'vertical':
      let minV = 5;
      for (let c = 0; c < 5; col++) {
        let n = 0;
        for (let r = 0; r < 5; r++) if (!isCellMarked(tempCard, r, c)) n++;
        minV = Math.min(minV, n);
      }
      return minV;
    case 'diagonal':
      // No modo D-V-H, calculamos o mínimo necessário para qualquer uma das opções
      let minAny = 5;
      // Horizontais
      for (let r = 0; r < 5; r++) {
        let n = 0;
        for (let c = 0; c < 5; c++) if (!isCellMarked(tempCard, r, c)) n++;
        minAny = Math.min(minAny, n);
      }
      // Verticais
      for (let c = 0; c < 5; c++) {
        let n = 0;
        for (let r = 0; r < 5; r++) if (!isCellMarked(tempCard, r, c)) n++;
        minAny = Math.min(minAny, n);
      }
      // Diagonais
      let d1 = 0, d2 = 0;
      for (let i = 0; i < 5; i++) {
          if (!isCellMarked(tempCard, i, i)) d1++;
          if (!isCellMarked(tempCard, i, 4 - i)) d2++;
      }
      minAny = Math.min(minAny, d1, d2);
      return minAny;
    default: return 99;
  }
};

export const gameTypeLabels: Record<GameType, string> = {
  full: 'Cartela Cheia',
  horizontal: 'Linha Horizontal',
  vertical: 'Linha Vertical',
  diagonal: 'Qualquer Linha (D-V-H)',
};

export const BINGO_RANGES = [
  { col: 'B', min: 1, max: 15 },
  { col: 'I', min: 16, max: 30 },
  { col: 'N', min: 31, max: 45 },
  { col: 'G', min: 46, max: 60 },
  { col: 'O', min: 61, max: 75 },
];