import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cancelAutomaticMatchForSingleParticipant = async (supabaseAdmin: any, match: any) => {
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('configuracoes')
    .select('custo_recarga_cartela, usos_por_recarga')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (settingsError) {
    throw new Error(`Erro ao buscar configuracoes para estorno: ${settingsError.message}`);
  }

  const { data: matchCards, error: matchCardsError } = await supabaseAdmin
    .from('cartelas_partida')
    .select('id, player_id, player_card_id, credit_type')
    .eq('match_id', match.id);

  if (matchCardsError) {
    throw new Error(`Erro ao buscar cartelas da partida ${match.id}: ${matchCardsError.message}`);
  }

  const cards = matchCards || [];
  if (cards.length === 0) {
    await supabaseAdmin
      .from('partidas')
      .update({
        status: 'finished',
        is_auto_calling: false,
        next_auto_call_timestamp: null,
        pot: 0,
        prize: { ...(match.prize || {}), returnedReason: 'ONLY_ONE_PLAYER' }
      })
      .eq('id', match.id);
    return;
  }

  const valorPorUso = Number(settings?.custo_recarga_cartela || 0) / Math.max(1, Number(settings?.usos_por_recarga || 1));
  const effectivePrice = Math.max(0, Number(match.card_price || 0) - valorPorUso);

  const refundByPlayer = new Map<string, { real: number; fake: number }>();
  for (const card of cards) {
    const current = refundByPlayer.get(card.player_id) || { real: 0, fake: 0 };
    if (card.credit_type === 'real') current.real += effectivePrice;
    else current.fake += effectivePrice;
    refundByPlayer.set(card.player_id, current);
  }

  for (const [playerId, refund] of refundByPlayer.entries()) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('perfis')
      .select('credits, fake_credits')
      .eq('id', playerId)
      .single();

    if (profileError) {
      throw new Error(`Erro ao buscar perfil ${playerId} para estorno: ${profileError.message}`);
    }

    const updates: Record<string, number> = {};
    if (refund.real > 0) updates.credits = Number(profile.credits || 0) + refund.real;
    if (refund.fake > 0) updates.fake_credits = Number(profile.fake_credits || 0) + refund.fake;

    if (Object.keys(updates).length > 0) {
      const { error: refundError } = await supabaseAdmin.from('perfis').update(updates).eq('id', playerId);
      if (refundError) {
        throw new Error(`Erro ao aplicar estorno para ${playerId}: ${refundError.message}`);
      }
    }
  }

  const playerCardIds = cards.map((card: any) => card.player_card_id).filter(Boolean);
  if (playerCardIds.length > 0) {
    const { data: playerCards, error: playerCardsError } = await supabaseAdmin
      .from('cartelas_jogador')
      .select('id, uses_left')
      .in('id', playerCardIds);

    if (playerCardsError) {
      throw new Error(`Erro ao restaurar usos das cartelas: ${playerCardsError.message}`);
    }

    await Promise.all((playerCards || []).map((card: any) =>
      supabaseAdmin.from('cartelas_jogador').update({ uses_left: Number(card.uses_left || 0) + 1 }).eq('id', card.id)
    ));
  }

  const matchCardIds = cards.map((card: any) => card.id);
  if (matchCardIds.length > 0) {
    const { error: deleteCardsError } = await supabaseAdmin.from('cartelas_partida').delete().in('id', matchCardIds);
    if (deleteCardsError) {
      throw new Error(`Erro ao remover cartelas da partida ${match.id}: ${deleteCardsError.message}`);
    }
  }

  const { error: finishError } = await supabaseAdmin
    .from('partidas')
    .update({
      status: 'finished',
      is_auto_calling: false,
      next_auto_call_timestamp: null,
      pot: 0,
      prize: { ...(match.prize || {}), returnedReason: 'ONLY_ONE_PLAYER' }
    })
    .eq('id', match.id);

  if (finishError) {
    throw new Error(`Erro ao finalizar partida ${match.id}: ${finishError.message}`);
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const loopEnd = Date.now() + 55000; // Run for 55 seconds
    console.log("[auto-call-engine] Iniciando ciclo de processamento de partidas...");

    while (Date.now() < loopEnd) {
      const nowIso = new Date().toISOString();

      // --- 1. PROCESSAR PARTIDAS AUTOMÁTICAS ABERTAS E ATRASADAS ---
      const { data: overdueMatches, error: overdueError } = await supabaseAdmin
        .from('partidas')
        .select('*')
        .eq('status', 'open')
        .lte('start_time', nowIso)
        .like('name', 'Bingo Automático%'); // <-- SÓ OLHA PARTIDAS AUTOMÁTICAS

      if (overdueError) {
        console.error("[auto-call-engine] Erro ao buscar partidas atrasadas:", overdueError.message);
        continue;
      }

      for (const match of overdueMatches || []) {
        const { data: participants, error: participantsError } = await supabaseAdmin
          .from('cartelas_partida')
          .select('player_id')
          .eq('match_id', match.id);

        if (participantsError) {
          console.error(`[auto-call-engine] Erro ao contar participantes da partida ${match.id}:`, participantsError.message);
          continue;
        }

        const uniqueParticipants = Array.from(new Set((participants || []).map((item: any) => item.player_id).filter(Boolean)));
        const participantCount = uniqueParticipants.length;

        if (participantCount === 0) {
          console.log(`[auto-call-engine] Deletando partida automática vazia e atrasada: ${match.name} (ID: ${match.id})`);
          await supabaseAdmin.from('partidas').delete().eq('id', match.id);
        } else if (participantCount === 1) {
          console.log(`[auto-call-engine] Encerrando ${match.name} por falta de participantes suficientes. Apenas 1 jogador encontrado.`);
          await cancelAutomaticMatchForSingleParticipant(supabaseAdmin, match);
        } else {
          console.log(`[auto-call-engine] Iniciando partida com ${participantCount} participantes: ${match.name}`);
          const { data: cfg } = await supabaseAdmin.from('configuracoes').select('intervalo_sorteio_auto_seg').order('created_at', { ascending: true }).limit(1).maybeSingle();
          const nextCall = new Date(Date.now() + (Number(cfg?.intervalo_sorteio_auto_seg || 10) * 1000)).toISOString();
          
          await supabaseAdmin.from('partidas').update({ 
            status: 'in_progress', 
            next_auto_call_timestamp: nextCall 
          }).eq('id', match.id);
        }
      }

      // --- 2. PROCESSAR SORTEIOS DE NÚMEROS ---
      const { data: toCall, error: toCallError } = await supabaseAdmin
        .from('partidas')
        .select('id')
        .eq('status', 'in_progress')
        .eq('is_auto_calling', true)
        .lte('next_auto_call_timestamp', nowIso);
      
      if (toCallError) {
        console.error("[auto-call-engine] Erro ao buscar partidas para sorteio:", toCallError.message);
        continue;
      }

      for (const match of toCall || []) {
        supabaseAdmin.functions.invoke('call-number', { 
          body: { matchId: match.id }
        }).catch(err => console.error(`[auto-call-engine] Erro ao invocar call-number para ${match.id}:`, err.message));
      }

      // --- 3. GARANTIR QUE O LOBBY NUNCA FIQUE VAZIO (DE PARTIDAS AUTOMÁTICAS) ---
      const { count: openOrWaitingAutoCount } = await supabaseAdmin
        .from('partidas')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'waiting'])
        .like('name', 'Bingo Automático%'); // <-- CORREÇÃO CRÍTICA AQUI

      if ((openOrWaitingAutoCount || 0) === 0) {
        const { data: settings } = await supabaseAdmin.from('configuracoes').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
        
        if (settings?.auto_engine_enabled) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const { data: todayMatches } = await supabaseAdmin.from('partidas').select('name').gte('created_at', today.toISOString());
            
            let nextNumber = 1;
            if (todayMatches && todayMatches.length > 0) {
              const numbers = todayMatches.map(m => {
                  const match = m.name.match(/#(\d+)/);
                  return match ? parseInt(match[1], 10) : 0;
                }).filter(n => n > 0);
              if (numbers.length > 0) nextNumber = Math.max(...numbers) + 1;
              else nextNumber = todayMatches.length + 1;
            }

            if (nextNumber <= settings.auto_engine_matches_per_day) {
                const nextStart = new Date(Date.now() + 30000).toISOString(); // Próxima em 30 segundos
                const newMatch = {
                  name: `Bingo Automático #${nextNumber}`,
                  game_type: settings.auto_engine_game_type,
                  max_cards_per_player: settings.auto_engine_max_cards || 3,
                  card_price: settings.auto_engine_card_price,
                  prize: { type: settings.auto_engine_prize_type, value: settings.auto_engine_prize_value },
                  start_time: nextStart,
                  status: 'open',
                  is_auto_calling: true,
                  min_players: 2,
                  admin_id: settings.admin_id
                };
                await supabaseAdmin.from('partidas').insert([newMatch]);
                console.log(`[auto-call-engine] Garantia: Criada nova partida ${newMatch.name}`);
            }
        }
      }

      await sleep(1000); // Verifica a cada segundo
    }

    return new Response(JSON.stringify({ success: true, message: "Ciclo concluído." }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("[auto-call-engine] Erro fatal no ciclo:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
})