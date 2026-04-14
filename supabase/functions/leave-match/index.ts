import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { matchId } = await req.json()
    if (!matchId) {
      throw new Error("O ID da partida é obrigatório.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error("Token de autorização não encontrado.");
    
    const userSupabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await userSupabaseClient.auth.getUser()
    if (userError || !user) throw new Error("Usuário não encontrado ou token inválido.");

    const { data: match, error: matchError } = await supabaseAdmin
      .from('partidas')
      .select('status, card_price, pot')
      .eq('id', matchId)
      .single();

    if (matchError) throw new Error(`Partida não encontrada.`);
    if (match.status !== 'open') throw new Error("Você só pode sair de partidas que estão abertas para inscrição.");

    const { data: settings, error: settingsError } = await supabaseAdmin.from('configuracoes').select('custo_recarga_cartela, usos_por_recarga').single();
    if (settingsError) throw new Error("Erro ao buscar configurações.");

    const { data: matchCardsToRemove, error: cardsError } = await supabaseAdmin
      .from('cartelas_partida')
      .select('id, player_card_id, credit_type')
      .eq('match_id', matchId)
      .eq('player_id', user.id);

    if (cardsError) throw new Error(`Erro ao buscar suas cartelas.`);
    if (!matchCardsToRemove || matchCardsToRemove.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Nenhuma cartela para remover." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const realCardsToRemove = matchCardsToRemove.filter(c => c.credit_type === 'real');
    const fakeCardsToRemove = matchCardsToRemove.filter(c => c.credit_type === 'fake');
    
    // Nunca permitir preço efetivo negativo para evitar qualquer crédito indevido.
    const valorPorUso = Number(settings?.custo_recarga_cartela || 0) / Math.max(1, Number(settings?.usos_por_recarga || 1));
    const effectivePrice = Math.max(0, Number(match.card_price) - valorPorUso);
    
    const realRefundAmount = realCardsToRemove.length * effectivePrice;
    const fakeRefundAmount = fakeCardsToRemove.length * effectivePrice;
    const fullRealCostForPot = realCardsToRemove.length * Number(match.card_price);
    
    const playerCardIdsToRestore = matchCardsToRemove.map(c => c.player_card_id).filter(id => id);
    const matchCardIdsToDelete = matchCardsToRemove.map(c => c.id);

    const { error: deleteError } = await supabaseAdmin
      .from('cartelas_partida')
      .delete()
      .in('id', matchCardIdsToDelete);
    if (deleteError) throw new Error(`Erro ao remover as cartelas da partida.`);

    if (realRefundAmount !== 0 || fakeRefundAmount !== 0) {
      const { data: profile, error: profileError } = await supabaseAdmin.from('perfis').select('credits, fake_credits').eq('id', user.id).single();
      if (profileError) throw new Error("Erro ao buscar seu perfil para o estorno.");

      const updates: any = {};
      if (realRefundAmount !== 0) updates.credits = Number(profile.credits || 0) + realRefundAmount;
      if (fakeRefundAmount !== 0) updates.fake_credits = Number(profile.fake_credits || 0) + fakeRefundAmount;

      await supabaseAdmin.from('perfis').update(updates).eq('id', user.id);
      
      if (fullRealCostForPot > 0) {
        const currentPot = Number(match.pot || 0);
        await supabaseAdmin.from('partidas').update({ pot: Math.max(0, currentPot - fullRealCostForPot) }).eq('id', matchId);
      }
    }

    if (playerCardIdsToRestore.length > 0) {
        const { data: playerCards, error: playerCardsError } = await supabaseAdmin.from('cartelas_jogador').select('id, uses_left').in('id', playerCardIdsToRestore);
        if (!playerCardsError && playerCards) {
            const restorePromises = playerCards.map(card =>
                supabaseAdmin.from('cartelas_jogador').update({ uses_left: card.uses_left + 1 }).eq('id', card.id)
            );
            await Promise.all(restorePromises);
        }
    }

    return new Response(JSON.stringify({ success: true, refundedReal: realRefundAmount, refundedFake: fakeRefundAmount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error(`[leave-match] Erro: ${error.message}`);
    // RETORNAMOS 200 COM SUCCESS = FALSE
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})