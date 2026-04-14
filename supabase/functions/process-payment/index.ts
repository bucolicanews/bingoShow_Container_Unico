import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { credits, amount } = await req.json()
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const userSupabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await userSupabaseClient.auth.getUser()
    if (userError || !user) throw new Error("Usuário não encontrado.")

    console.log(`[process-payment] Processando compra automática de ${credits} créditos para ${user.email}`);

    // 1. Registra a solicitação como já aprovada e puxa o ID
    const { data: request, error: requestError } = await supabaseAdmin
      .from('solicitacoes_credito')
      .insert({
        player_id: user.id,
        status: 'approved',
        credits_requested: credits,
        credits_granted: credits,
        amount_paid: amount,
        receipt_url: 'AUTOMATIC_PAYMENT',
        notes: 'Pagamento processado automaticamente.',
        resolved_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (requestError) throw requestError;

    // 2. Insere a mensagem no chat para que não fique vazia
    await supabaseAdmin.from('mensagens_solicitacao').insert({
        credit_request_id: request.id,
        sender_id: user.id,
        message: `✅ Pagamento automático aprovado!\nValor: R$ ${Number(amount).toFixed(2)}\nCréditos recebidos: ${credits} cr.`
    });

    // 3. Incrementa os créditos do jogador
    const { error: creditError } = await supabaseAdmin.rpc('increment_player_credits', {
      p_player_id: user.id,
      p_amount: credits
    });

    if (creditError) throw creditError;

    // 4. Notifica o n8n
    try {
      await fetch(`https://vqvnodwojefubbbnbyar.supabase.co/functions/v1/notify-n8n`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          event: 'AUTOMATIC_CREDIT_PURCHASE',
          data: {
            requestId: request.id,
            credits,
            amount,
            userEmail: user.email
          }
        })
      });
    } catch (e: any) {
      console.error("[process-payment] Erro ao notificar n8n:", e.message);
    }

    return new Response(JSON.stringify({ success: true, credits }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("[process-payment] Erro:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})