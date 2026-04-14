import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { matchId, playerCardIds, refCode } = await req.json()
    
    if (!matchId || !playerCardIds || !Array.isArray(playerCardIds) || playerCardIds.length === 0) {
      throw new Error("matchId e playerCardIds são obrigatórios.");
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
    if (userError || !user) throw new Error("Usuário não encontrado ou token expirado.");

    // Verifica se as cartelas já estão na partida
    const { data: existingMatchCards, error: existingError } = await supabaseAdmin
      .from('cartelas_partida')
      .select('player_card_id')
      .eq('match_id', matchId)
      .in('player_card_id', playerCardIds);

    if (existingError) throw new Error(`Erro de banco ao verificar duplicatas.`);
    if (existingMatchCards && existingMatchCards.length > 0) {
        throw new Error("Uma ou mais cartelas já estão na partida.");
    }

    const [matchRes, profileRes, playerCardsRes, settingsRes] = await Promise.all([
      supabaseAdmin.from('partidas').select('card_price, pot').eq('id', matchId).single(),
      supabaseAdmin.from('perfis').select('credits, fake_credits, bloqueado').eq('id', user.id).single(),
      supabaseAdmin.from('cartelas_jogador').select('*').in('id', playerCardIds),
      supabaseAdmin.from('configuracoes').select('custo_recarga_cartela, usos_por_recarga, comissao_vendedor_global').single()
    ]);

    if (matchRes.error) throw new Error(`Partida não encontrada.`);
    if (profileRes.error) throw new Error(`Perfil não encontrado.`);
    if (playerCardsRes.error) throw new Error(`Erro ao buscar cartelas.`);
    if (settingsRes.error) throw new Error(`Erro ao buscar configurações.`);

    const match = matchRes.data;
    const profile = profileRes.data;
    const playerCards = playerCardsRes.data;
    const settings = settingsRes.data;

    // Verifica limite de cartelas ativas na partida para o usuário
    const { count: currentCardsCount, error: countError } = await supabaseAdmin
      .from('cartelas_partida')
      .select('*', { count: 'exact', head: true })
      .eq('match_id', matchId)
      .eq('player_id', user.id);

    if (countError) throw new Error("Erro ao verificar o limite de cartelas.");

    if ((currentCardsCount || 0) + playerCardIds.length > match.max_cards_per_player) {
      throw new Error(`Limite excedido! Você só pode ter no máximo ${match.max_cards_per_player} cartelas nesta partida.`);
    }

    if (profile.bloqueado) {
      throw new Error("Sua conta está bloqueada.");
    }

    const realCards = playerCards.filter(c => c.credit_type === 'real');
    const fakeCards = playerCards.filter(c => c.credit_type === 'fake');
    
    if (Number(match.card_price) < 0) {
      throw new Error('Preço da partida inválido. Contate o administrador.');
    }

    // Nunca permitir preço efetivo negativo para evitar crédito indevido ao entrar na partida.
    const valorPorUso = Number(settings.custo_recarga_cartela || 0) / Math.max(1, Number(settings.usos_por_recarga || 1));
    const effectivePrice = Math.max(0, Number(match.card_price) - valorPorUso);

    const realCost = realCards.length * effectivePrice;
    const fakeCost = fakeCards.length * effectivePrice;
    
    // O valor integral que vai para o Pote e calcula Comissão (pq o admin já recebeu a recarga antes)
    const fullRealCostForPot = realCards.length * Number(match.card_price);

    if (realCost > 0 && profile.credits < realCost) {
      throw new Error(`Créditos reais insuficientes! O valor de entrada requer mais ${realCost.toFixed(2)} créditos.`);
    }
    
    if (fakeCost > 0 && (profile.fake_credits || 0) < fakeCost) {
      throw new Error(`Créditos de brincar insuficientes! Requer mais ${fakeCost.toFixed(2)} créditos.`);
    }

    // --- LÓGICA DE COMISSÃO DO BINGO VIA LINK DE INDICAÇÃO (Apenas Crédito Real) ---
    let commissionAmount = 0;
    let sellerUserId = null;
    let vendedorDaTabelaId = null;

    if (refCode && fullRealCostForPot > 0) {
      const { data: seller } = await supabaseAdmin
        .from('vendedores_rifa')
        .select('id, user_id, comissao_percentual')
        .eq('codigo_ref', refCode)
        .eq('ativo', true)
        .single();

      if (seller && seller.user_id) {
        let comissao = seller.comissao_percentual;
        vendedorDaTabelaId = seller.id;

        if (!comissao || comissao === 0) {
          comissao = settings.comissao_vendedor_global || 0;
        }
        if (comissao > 0) {
          commissionAmount = fullRealCostForPot * (comissao / 100.0);
          sellerUserId = seller.user_id;
        }
      }
    }

    // 1. Desconta ou Devolve o custo do jogador (Real e Brincar)
    const profileUpdates: any = {};
    if (realCost !== 0) profileUpdates.credits = Number(profile.credits) - realCost;
    if (fakeCost !== 0) profileUpdates.fake_credits = Number(profile.fake_credits || 0) - fakeCost;

    if (Object.keys(profileUpdates).length > 0) {
      const { error: creditError } = await supabaseAdmin
        .from('perfis')
        .update(profileUpdates)
        .eq('id', user.id);
      if (creditError) throw new Error(`Falha ao processar a cobrança dos créditos.`);
    }

    // 2. Paga a comissão ao vendedor e desconta do lucro do admin (Apenas Real)
    if (sellerUserId && commissionAmount > 0) {
      console.log(`[join-match] Pagando comissão de ${commissionAmount} ao vendedor ${sellerUserId}`);
      await supabaseAdmin.rpc('increment_player_credits', { p_player_id: sellerUserId, p_amount: commissionAmount });
      await supabaseAdmin.rpc('increment_admin_profit', { amount: -commissionAmount });
    }

    for (const card of playerCards) {
        await supabaseAdmin
            .from('cartelas_jogador')
            .update({ uses_left: Math.max(0, card.uses_left - 1) })
            .eq('id', card.id);
    }

    // INSERE O VENDEDOR ID NA CARTELA DA PARTIDA!
    const newMatchCards = playerCards.map(card => ({
      player_id: user.id,
      match_id: matchId,
      player_card_id: card.id,
      name: card.name,
      numbers: card.numbers,
      marked_numbers: [0],
      credit_type: card.credit_type,
      vendedor_id: vendedorDaTabelaId
    }));

    const { data: insertedMatchCards, error: insertError } = await supabaseAdmin
      .from('cartelas_partida')
      .insert(newMatchCards)
      .select();
    
    if (insertError) {
        throw new Error(`Falha ao alocar as cartelas na partida.`);
    }

    if (fullRealCostForPot > 0) {
      const currentPot = Number(match.pot || 0);
      await supabaseAdmin.from('partidas').update({ pot: currentPot + fullRealCostForPot }).eq('id', matchId);
    }

    return new Response(JSON.stringify({ success: true, data: insertedMatchCards }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("[join-match] Erro:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})