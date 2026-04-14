import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---- Lógica de Verificação de Bingo ----
type GameType = 'horizontal' | 'vertical' | 'diagonal' | 'full';
interface BingoCard { id: string; name: string; numbers: number[][]; markedNumbers: Set<number>; }
interface WinResult { cardId: string; cardName: string; type: GameType; winningNumbers: number[]; }

const isCellMarked = (card: BingoCard, row: number, col: number): boolean => {
  const num = Number(card.numbers[row][col]);
  if (num === 0) return true; 
  return card.markedNumbers.has(num);
};

const checkHorizontalWin = (card: BingoCard): number[] | null => {
  for (let row = 0; row < 5; row++) {
    if ([0,1,2,3,4].every(col => isCellMarked(card, row, col))) return card.numbers[row].map(Number);
  }
  return null;
};

const checkVerticalWin = (card: BingoCard): number[] | null => {
  for (let col = 0; col < 5; col++) {
    if ([0,1,2,3,4].every(row => isCellMarked(card, row, col))) return card.numbers.map(r => Number(r[col]));
  }
  return null;
};

const checkDiagonalWin = (card: BingoCard): number[] | null => {
  if ([0,1,2,3,4].every(i => isCellMarked(card, i, i))) return [0,1,2,3,4].map(i => Number(card.numbers[i][i]));
  if ([0,1,2,3,4].every(i => isCellMarked(card, i, 4-i))) return [0,1,2,3,4].map(i => Number(card.numbers[i][4-i]));
  return null;
};

const checkFullCardWin = (card: BingoCard): number[] | null => {
  const all: number[] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    if (!isCellMarked(card, r, c)) return null;
    if (Number(card.numbers[r][c]) !== 0) all.push(Number(card.numbers[r][c]));
  }
  return all;
};

const checkWin = (card: BingoCard, gameType: GameType): WinResult | null => {
  let winning: number[] | null = null;
  const type = String(gameType).toLowerCase().trim() as GameType;
  
  switch (type) {
    case 'horizontal':
      winning = checkHorizontalWin(card);
      break;
    case 'vertical':
      winning = checkVerticalWin(card);
      break;
    case 'diagonal':
      // No modo "Qualquer Linha (D-V-H)", aceita qualquer uma das três
      winning = checkHorizontalWin(card) || checkVerticalWin(card) || checkDiagonalWin(card);
      break;
    case 'full':
      winning = checkFullCardWin(card);
      break;
  }
  
  if (!winning) return null;
  return { cardId: card.id, cardName: card.name, type, winningNumbers: winning };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { matchId, specificNumber, checkOnly } = await req.json();
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`[call-number] Processando partida ${matchId} (checkOnly: ${checkOnly})`);

    // 1. Lock para evitar processamento duplo
    const { data: gotLock } = await supabaseAdmin.rpc('try_lock_match', { p_match_id: matchId });
    if (!gotLock) return new Response(JSON.stringify({ success: true, message: 'Match busy' }), { headers: corsHeaders });

    // 2. Buscar Partida atualizada
    const { data: match, error: matchErr } = await supabaseAdmin.from('partidas').select('*').eq('id', matchId).single();
    if (matchErr || !match) throw new Error("Partida não encontrada");
    if (match.status === 'finished') return new Response(JSON.stringify({ success: true, message: 'Match finished' }), { headers: corsHeaders });

    let num = null;

    if (!checkOnly) {
        // 3. Sorteio
        const calledArray = match.called_numbers || [];
        const availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !calledArray.includes(n));

        if (availableNumbers.length === 0) {
          await supabaseAdmin.from('partidas').update({ status: 'finished', is_auto_calling: false }).eq('id', matchId);
          return new Response(JSON.stringify({ success: true, message: 'No numbers left' }), { headers: corsHeaders });
        }

        num = (specificNumber && availableNumbers.includes(specificNumber))
          ? specificNumber
          : availableNumbers[Math.floor(Math.random() * availableNumbers.length)];

        // 4. Registrar número e marcar cartelas no banco
        const { data: appendResult } = await supabaseAdmin.rpc('append_called_number', { p_match_id: matchId, p_num: num });
        if (!appendResult || appendResult.already_called) {
           return new Response(JSON.stringify({ success: true, message: 'Number already processed' }), { headers: corsHeaders });
        }
        await supabaseAdmin.rpc('mark_number_for_match_cards', { p_match_id: matchId, p_num: num });
    }

    // 5. Analisar Vencedores
    const { data: matchCards } = await supabaseAdmin.from('cartelas_partida').select('*').eq('match_id', matchId);
    const { data: allProfiles } = await supabaseAdmin.from('perfis').select('id, full_name');
    
    const existingWinnerCardIds = new Set((match.winners || []).map((w: any) => w.cardId));
    const newWinnersFound: any[] = [];

    const calledNumbersSet = new Set(match.called_numbers || []);
    if (!checkOnly && num !== null) calledNumbersSet.add(num);

    for (const card of (matchCards || [])) {
      if (existingWinnerCardIds.has(card.id)) continue;

      const grid: number[][] = (card.numbers as any).map((row: any) => row.map(Number));
      const tempCard: BingoCard = {
        id: card.id,
        name: card.name,
        numbers: grid,
        markedNumbers: new Set(card.marked_numbers as number[])
      };

      const winResult = checkWin(tempCard, match.game_type);
      if (winResult) {
        // SEGURANÇA: Verificar se todos os números vencedores realmente foram sorteados
        const uncalled = winResult.winningNumbers.filter(n => n !== 0 && !calledNumbersSet.has(n));

        if (uncalled.length === 0) {
            newWinnersFound.push({
              playerId: card.player_id,
              playerName: allProfiles?.find(p => p.id === card.player_id)?.full_name || 'Jogador',
              cardId: card.id,
              cardName: card.name,
              creditType: card.credit_type,
              playerCardId: card.player_card_id,
              numbers: grid,
              markedNumbers: Array.from(tempCard.markedNumbers)
            });
        }
      }
    }

    // 6. Registrar Vitorias e processar premios
    const updatedWinners = [...(match.winners || []), ...newWinnersFound];
    let tieBreakInfo: any = null;

    if (newWinnersFound.length > 0) {
      console.log(`[call-number] ${newWinnersFound.length} novos vencedores encontrados!`);

      // 6.1. Registro imediato na tabela de vitorias (historico/trofeus)
      for (const w of newWinnersFound) {
        const { error: winInsertErr } = await supabaseAdmin.from('vitorias').insert({
          match_id: matchId,
          player_id: w.playerId,
          player_card_id: w.playerCardId,
          match_card_id: w.cardId,
          prize_details: match.prize
        });
        if (winInsertErr) console.error(`[call-number] Erro ao inserir na tabela vitorias:`, winInsertErr);
      }

      const realWinners = newWinnersFound.filter(w => w.creditType === 'real');
      const uniqueRealWinnerPlayerIds = Array.from(new Set(realWinners.map((w: any) => w.playerId)));

      if (uniqueRealWinnerPlayerIds.length === 1) {
        // Fluxo normal: apenas um vencedor real
        await supabaseAdmin.from('partidas').update({
          status: 'finished',
          winners: updatedWinners,
          is_auto_calling: false,
          next_auto_call_timestamp: null,
          tie_break_status: 'none',
          tie_break_session_id: null
        }).eq('id', matchId);

        const safePot = Number(match.pot) || 0;
        const prizeValConf = Number(match.prize?.value) || 0;
        const totalPrizePool = match.prize?.type === 'fixed' ? prizeValConf : (match.prize?.type === 'percentage' ? (safePot * prizeValConf) / 100 : 0);

        const isFestival = match.is_festival;
        const isLastRound = !isFestival || (match.current_round >= (match.prizes?.length || 0) - 1);

        if (isLastRound) {
          let totalSpentAllRounds = totalPrizePool;
          if (isFestival && match.completed_rounds) {
            for (const cr of match.completed_rounds) {
              const cp = cr.prize;
              const cpVal = Number(cp?.value) || 0;
              if (cp?.type === 'fixed') totalSpentAllRounds += cpVal;
              else if (cp?.type === 'percentage') totalSpentAllRounds += (safePot * cpVal) / 100;
            }
          }
          const adminProfit = Math.max(0, safePot - totalSpentAllRounds);
          if (adminProfit > 0) {
            await supabaseAdmin.rpc('increment_admin_profit', { amount: adminProfit });
          }
        }

        const winner = realWinners[0];
        if (totalPrizePool > 0) {
          await supabaseAdmin.rpc('increment_player_credits', { p_player_id: winner.playerId, p_amount: totalPrizePool });
        }
      } else if (uniqueRealWinnerPlayerIds.length > 1) {
        // Novo fluxo: empate entre vencedores reais. Pausa e abre sessao de desempate.
        const tiedPlayerIds = uniqueRealWinnerPlayerIds;

        const { data: tieSessionData, error: tieSessionError } = await supabaseAdmin.rpc('create_tie_break_session', {
          p_match_id: matchId,
          p_player_ids: tiedPlayerIds
        });

        if (tieSessionError || !tieSessionData?.success) {
          console.error('[call-number] Falha ao criar sessao de desempate:', tieSessionError?.message || tieSessionData?.error);

          // Nunca perder registro de ganhadores: salva no match mesmo se o desempate falhar.
          await supabaseAdmin.from('partidas').update({
            winners: updatedWinners,
            is_auto_calling: false,
            next_auto_call_timestamp: null
          }).eq('id', matchId);

          tieBreakInfo = {
            required: true,
            failedToCreateSession: true,
            tiedPlayerIds
          };
        } else {
          await supabaseAdmin.from('partidas').update({
            winners: updatedWinners,
            is_auto_calling: false,
            next_auto_call_timestamp: null,
            tie_break_status: 'pending',
            tie_break_session_id: tieSessionData.sessionId
          }).eq('id', matchId);

          tieBreakInfo = {
            required: true,
            sessionId: tieSessionData.sessionId,
            allowedOptions: tieSessionData.allowedOptions || null,
            splitAllowed: tieSessionData.splitAllowed,
            tiedPlayerIds
          };
        }
      } else {
        // Apenas vencedores de brincar
        const hasRemainingReal = (matchCards || []).some(c => c.credit_type === 'real' && !updatedWinners.some(w => w.cardId === c.id));

        if (hasRemainingReal) {
          if (!checkOnly) {
            const { data: cfg } = await supabaseAdmin.from('configuracoes').select('intervalo_sorteio_auto_seg').single();
            const next = new Date(Date.now() + (Number(cfg?.intervalo_sorteio_auto_seg || 120) * 1000)).toISOString();
            await supabaseAdmin.from('partidas').update({ winners: updatedWinners, next_auto_call_timestamp: next }).eq('id', matchId);
          } else {
            await supabaseAdmin.from('partidas').update({ winners: updatedWinners }).eq('id', matchId);
          }
        } else {
          await supabaseAdmin.from('partidas').update({
            status: 'finished',
            winners: updatedWinners,
            is_auto_calling: false,
            next_auto_call_timestamp: null,
            tie_break_status: 'none',
            tie_break_session_id: null
          }).eq('id', matchId);
        }
      }
    } else if (match.is_auto_calling && !checkOnly) {
      // Ninguém ganhou nesta bola, programa o próximo sorteio
      const { data: cfg } = await supabaseAdmin.from('configuracoes').select('intervalo_sorteio_auto_seg').single();
      const next = new Date(Date.now() + (Number(cfg?.intervalo_sorteio_auto_seg || 120) * 1000)).toISOString();
      await supabaseAdmin.from('partidas').update({ next_auto_call_timestamp: next }).eq('id', matchId);
    }

    return new Response(JSON.stringify({ success: true, newWinners: newWinnersFound, tieBreak: tieBreakInfo }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("[call-number] Erro fatal:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
})