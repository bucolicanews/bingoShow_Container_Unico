export type GameType = 'full' | 'horizontal' | 'vertical' | 'diagonal';

export interface BingoCard {
  id: string;
  name: string;
  numbers: number[][]; // 5x5 grid
  markedNumbers: Set<number>;
}

export interface WinResult {
  cardId: string;
  cardName: string;
  type: GameType;
  winningNumbers: number[];
}
