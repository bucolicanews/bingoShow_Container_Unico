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
    const { force = false } = await req.json().catch(() => ({}));
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('configuracoes')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings) throw new Error("Configurações não encontradas.");

    if (!settings.auto_engine_enabled && !force) {
      return new Response(JSON.stringify({ message: "Motor desativado." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 1. Determinar o próximo número da partida (evitando duplicatas)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: todayMatches } = await supabaseAdmin
      .from('partidas')
      .select('name')
      .gte('created_at', today.toISOString());
    
    let nextNumber = 1;
    if (todayMatches && todayMatches.length > 0) {
      const numbers = todayMatches
        .map(m => {
          const match = m.name.match(/#(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);
      
      if (numbers.length > 0) {
        nextNumber = Math.max(...numbers) + 1;
      } else {
        nextNumber = todayMatches.length + 1;
      }
    }

    // Verificar limite diário
    if (nextNumber > settings.auto_engine_matches_per_day) {
      return new Response(JSON.stringify({ message: "Limite diário de partidas atingido." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 2. Lógica de Slots Fixos
    const now = new Date();
    const startHour = settings.auto_engine_start_hour || 0;
    const interval = settings.auto_engine_interval_mins || 60;
    
    const reference = new Date();
    reference.setHours(startHour, 0, 0, 0);
    
    let nextSlot = reference.getTime();
    // Encontra o primeiro slot no futuro (com margem de 10s)
    while (nextSlot <= now.getTime() + (10 * 1000)) { 
      nextSlot += interval * 60 * 1000;
    }

    const nextStartTime = new Date(nextSlot);

    // 3. Verificar se já existe uma partida para este slot específico
    const { data: existing } = await supabaseAdmin
      .from('partidas')
      .select('id')
      .eq('start_time', nextStartTime.toISOString())
      .in('status', ['open', 'in_progress', 'waiting'])
      .limit(1);

    if (existing && existing.length > 0 && !force) {
      return new Response(JSON.stringify({ message: "Slot já ocupado para este horário." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const newMatch = {
      name: `Bingo Automático #${nextNumber}`,
      game_type: settings.auto_engine_game_type,
      max_cards_per_player: settings.auto_engine_max_cards || 3,
      card_price: settings.auto_engine_card_price,
      prize: { type: settings.auto_engine_prize_type, value: settings.auto_engine_prize_value },
      start_time: nextStartTime.toISOString(),
      status: 'open',
      is_auto_calling: true,
      min_players: 2,
      admin_id: settings.admin_id
    };

    const { data: created, error: createError } = await supabaseAdmin.from('partidas').insert(newMatch).select().single();
    if (createError) throw createError;

    console.log(`[auto-engine] Partida criada: ${newMatch.name} para ${newMatch.start_time}`);

    return new Response(JSON.stringify({ success: true, match: created }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(`[auto-engine] Erro: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})