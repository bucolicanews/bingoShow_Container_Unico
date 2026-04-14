import type { BingoCard, GameType, WinResult } from './types.ts';

// Garante que o centro (2,2) seja sempre considerado marcado
const isCellMarked = (card: BingoCard, row: number, col: number): boolean => {
  if (row === 2 && col === 2) return true; // Espaço Livre
  const num = card.numbers[row][col];
  return card.markedNumbers.has(num);
};

export const checkHorizontalWin = (card: BingoCard): number[] | null => {
  for (let row = 0; row < 5; row++) {
    let allMarked = true;
    for (let col = 0; col < 5; col++) {
      if (!isCellMarked(card, row, col)) {
        allMarked = false;
        break;
      }
    }
    if (allMarked) return card.numbers[row];
  }
  return null;
};

export const checkVerticalWin = (card: BingoCard): number[] | null => {
  for (let col = 0; col < 5; col++) {
    let allMarked = true;
    for (let row = 0; row < 5; row++) {
      if (!isCellMarked(card, row, col)) {
        allMarked = false;
        break;
      }
    }
    if (allMarked) return card.numbers.map(r => r[col]);
  }
  return null;
};

export const checkDiagonalWin = (card: BingoCard): number[] | null => {
  // Principal
  let mainDiagMarked = true;
  for (let i = 0; i < 5; i++) {
    if (!isCellMarked(card, i, i)) {
      mainDiagMarked = false;
      break;
    }
  }
  if (mainDiagMarked) return [0, 1, 2, 3, 4].map(i => card.numbers[i][i]);

  // Secundária
  let antiDiagMarked = true;
  for (let i = 0; i < 5; i++) {
    if (!isCellMarked(card, i, 4 - i)) {
      antiDiagMarked = false;
      break;
    }
  }
  if (antiDiagMarked) return [0, 1, 2, 3, 4].map(i => card.numbers[i][4 - i]);

  return null;
};

export const checkFullCardWin = (card: BingoCard): number[] | null => {
  const allNumbers: number[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (!isCellMarked(card, row, col)) return null;
      if (!(row === 2 && col === 2)) {
        allNumbers.push(card.numbers[row][col]);
      }
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
      // No modo "Qualquer Linha (D-V-H)", aceita qualquer uma das três
      winningNumbers = checkHorizontalWin(card) || checkVerticalWin(card) || checkDiagonalWin(card);
      break;
    case 'full':
      winningNumbers = checkFullCardWin(card);
      break;
  }

  if (winningNumbers) {
    return {
      cardId: card.id,
      cardName: card.name,
      type: type,
      winningNumbers,
    };
  }

  return null;
};