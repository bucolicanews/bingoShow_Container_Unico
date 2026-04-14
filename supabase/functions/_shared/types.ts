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

export type MatchStatus = 'waiting' | 'open' | 'in_progress' | 'finished';
export type PrizeType = 'product' | 'fixed' | 'percentage';

export interface Prize {
  type: PrizeType;
  value: number | null;
  productName?: string;
}

export interface Winner {
  playerId: string;
  playerName: string;
  cardId: string;
  cardName: string;
}

export interface Match {
  id: string;
  name: string;
  game_type: GameType;
  max_cards_per_player: number;
  card_price: number;
  prize: Prize;
  start_time: string;
  status: MatchStatus;
  called_numbers: number[];
  pot: number;
  created_at: string;
  is_auto_calling?: boolean;
  next_auto_call_timestamp?: number;
  winners: Winner[];
}

export interface MatchCard {
  id: string;
  player_card_id: string;
  player_id: string;
  match_id: string;
  name: string;
  numbers: number[][];
  marked_numbers: number[] | Set<number>; // Allow both for flexibility
}