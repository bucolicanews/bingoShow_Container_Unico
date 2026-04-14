import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Cliente Admin para ignorar o RLS e realizar as operações do sistema
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Cliente do Usuário apenas para verificar a autenticação real do token
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { credits, amount, message } = await req.json()
    if (!credits || !amount) {
      return new Response(JSON.stringify({ error: 'invalid_params' }), { status: 400, headers: corsHeaders })
    }

    // 1. Busca o saldo atual do usuário
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('perfis')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ success: false, error: 'profile_not_found' }), { headers: corsHeaders })
    }

    if (profile.credits < credits) {
      return new Response(JSON.stringify({ success: false, error: 'insufficient_credits' }), { headers: corsHeaders })
    }

    // 2. Desconta os créditos da conta
    const { error: updateError } = await supabaseAdmin
      .from('perfis')
      .update({ credits: Number(profile.credits) - Number(credits) })
      .eq('id', user.id)

    if (updateError) {
      return new Response(JSON.stringify({ success: false, error: updateError.message }), { headers: corsHeaders })
    }

    // 3. Cria o pedido de resgate
    const { data: requestData, error: requestError } = await supabaseAdmin
      .from('solicitacoes_resgate')
      .insert({
        player_id: user.id,
        credits_requested: credits,
        amount_to_receive: amount,
        status: 'pending'
      })
      .select('id')
      .single()

    if (requestError || !requestData) {
      // Se falhar, devolve os créditos como compensação
      await supabaseAdmin.from('perfis').update({ credits: profile.credits }).eq('id', user.id)
      return new Response(JSON.stringify({ success: false, error: requestError?.message || 'Error creating request' }), { headers: corsHeaders })
    }

    // 4. Salva a mensagem / chave PIX se o jogador preencheu
    if (message && message.trim() !== '') {
      await supabaseAdmin
        .from('mensagens_resgate')
        .insert({
          redeem_request_id: requestData.id,
          sender_id: user.id,
          message: message.trim()
        })
    }

    // 5. Notifica o N8N (se estiver configurado, processa em background sem bloquear o retorno)
    supabaseAdmin.functions.invoke('notify-n8n', {
      body: { event: 'REDEEM_REQUEST', data: { requestId: requestData.id, credits, amount, userEmail: user.email } }
    }).catch(err => console.error("n8n notify error:", err));

    return new Response(
      JSON.stringify({ success: true, request_id: requestData.id }),
      { headers: corsHeaders }
    )

  } catch (err: any) {
    console.error("Redeem Request Error:", err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: corsHeaders }
    )
  }
})