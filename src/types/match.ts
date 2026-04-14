import { GameType } from './bingo';

export type MatchStatus = 'waiting' | 'open' | 'in_progress' | 'finished';
export type PrizeType = 'product' | 'fixed' | 'percentage';

export interface Prize {
  type: PrizeType;
  value: number | null;
  productName?: string;
  returnedReason?: 'NO_PLAYERS' | 'ONLY_ONE_PLAYER';
}

export interface Winner {
  playerId: string;
  playerName:string;
  cardId: string;
  cardName: string;
  creditType?: 'real' | 'fake';
  playerCardId?: string;
  numbers?: number[][];
  markedNumbers?: number[];
}

export interface Match {
  id: string;
  name: string;
  game_type: GameType;
  max_cards_per_player: number;
  card_price: number;
  prize: Prize;
  prize_image_url?: string;
  start_time: string;
  status: MatchStatus;
  called_numbers: number[];
  pot: number;
  created_at: string;
  is_auto_calling?: boolean;
  next_auto_call_timestamp?: string | number;
  winners: Winner[];
  min_players: number;
  admin_profit_from_match?: number;
  
  // Desempate
  tie_break_status?: 'none' | 'pending' | 'resolved';
  tie_break_session_id?: string | null;

  is_festival?: boolean;
  prizes?: Prize[];
  current_round?: number;
  completed_rounds?: { round: number; prize: Prize; winners: Winner[] }[];
}

export interface PlayerCard {
  id: string;
  player_id: string;
  name: string;
  numbers: number[][];
  uses_left: number;
  is_archived: boolean;
  credit_type: 'real' | 'fake';
}

export interface MatchCard {
  id:string;
  player_card_id: string;
  player_id: string;
  match_id: string;
  name: string;
  numbers: number[][];
  marked_numbers: Set<number>;
  credit_type: 'real' | 'fake';
  marking_mode: 'auto' | 'manual';
}

export interface Win {
  id: string;
  match_id: string;
  player_id: string;
  player_card_id: string;
  match_card_id: string;
  prize_details: Prize;
  won_at: string;
}

export interface GameSettings {
  id?: string;
  admin_id?: string;
  custo_nova_cartela: number;
  custo_recarga_cartela: number;
  usos_por_recarga: number;
  intervalo_sorteio_auto_seg: number;
  valor_por_credito: number;
  pix_key?: string;
  pix_name?: string;
  pix_city?: string;
  credit_request_text?: string;
  n8n_test_url?: string;
  n8n_prod_url?: string;
  n8n_env?: 'test' | 'production';
  admin_profit: number;
  auto_engine_enabled: boolean;
  auto_engine_interval_mins: number;
  auto_engine_matches_per_day: number;
  auto_engine_game_type: GameType;
  auto_engine_card_price: number;
  auto_engine_prize_type: PrizeType;
  auto_engine_prize_value: number;
  auto_engine_start_hour: number;
  auto_engine_max_cards: number;
  desconto_vendedor_global: number;
  comissao_vendedor_global: number;
  cartelas_por_folha_bingo: number;
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  stripe_enabled: boolean;
  stripe_pass_fees_to_customer: boolean;
  stripe_fee_percentage: number;
  stripe_fee_fixed: number;
  stripe_env?: 'test' | 'live';
  stripe_secret_key_test?: string;
  stripe_webhook_secret_test?: string;
  pagbank_enabled?: boolean;
  pagbank_env?: 'sandbox' | 'producao';
  pagbank_token_sandbox?: string;
  pagbank_token_producao?: string;
  pagbank_pass_fees_to_customer?: boolean;
  pagbank_pix_fee_fixed?: number;
  pagbank_pix_fee_percentage?: number;
  pagbank_card_fee_fixed?: number;
  pagbank_card_fee_percentage?: number;
}

export interface FolhaBingoFisico {
  id: string;
  match_id: string;
  vendedor_id: string;
  codigo_validacao: string;
  grids: number[][][]; 
  valor_pago: number;
  status: 'pago' | 'pendente' | 'em_analise';
  created_at: string;
  partidas?: Match;
  vendedores_rifa?: {
    nome: string;
    codigo_ref?: string;
  };
}

export interface CreditRequestMessage {
  id: string;
  credit_request_id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

export interface CreditRequest {
  id: string;
  player_id: string;
  status: 'pending' | 'approved' | 'rejected';
  receipt_url: string;
  credits_granted: number | null;
  credits_requested: number | null;
  amount_paid: number | null;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  resubmission_notes: string | null;
  repasse_concluido?: boolean;
  perfis?: {
    full_name: string;
    avatar_url: string;
  };
  mensagens?: CreditRequestMessage[];
}

export interface RedeemRequestMessage {
  id: string;
  redeem_request_id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

export interface RedeemRequest {
  id: string;
  player_id: string;
  status: 'pending' | 'approved' | 'rejected';
  credits_requested: number;
  amount_to_receive: number;
  receipt_url: string | null;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  resubmission_notes: string | null;
  perfis?: {
    full_name: string;
    avatar_url: string;
  };
}