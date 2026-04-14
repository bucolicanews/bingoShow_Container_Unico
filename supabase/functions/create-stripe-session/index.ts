import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import Stripe from 'npm:stripe@16.10.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log(`[create-stripe-session] 🟢 INÍCIO DA REQUISIÇÃO: ${req.method}`);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json();
    console.log("[create-stripe-session] DADOS RECEBIDOS DO APP:", body);

    const { amount, type, metadata = {} } = body;
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('configuracoes')
      .select('stripe_secret_key, stripe_secret_key_test, stripe_env, stripe_pass_fees_to_customer, stripe_fee_percentage, stripe_fee_fixed')
      .limit(1)
      .maybeSingle();

    if (settingsError) throw new Error("Erro ao buscar configurações do Stripe.");

    const secretKey = settings.stripe_env === 'live' ? settings.stripe_secret_key : settings.stripe_secret_key_test;

    if (!secretKey) {
        throw new Error(`Chave secreta do Stripe para o ambiente '${settings.stripe_env}' não está configurada.`);
    }

    const stripe = new Stripe(secretKey.trim(), {
      apiVersion: '2024-06-20',
    })

    const authHeader = req.headers.get('Authorization')
    let user = null;

    if (authHeader && authHeader !== 'Bearer null' && authHeader !== 'null') {
      try {
        const userSupabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data } = await userSupabaseClient.auth.getUser()
        if (data?.user) user = data.user;
      } catch(e) {
          console.error("[create-stripe-session] Auth pass-through falhou", e);
      }
    }
    
    if (!user && type === 'credits') {
        throw new Error("Usuário não autenticado para compra de créditos.");
    }

    let finalAmount = Number(amount);
    if (settings.stripe_pass_fees_to_customer) {
      const percentage = Number(settings.stripe_fee_percentage || 0);
      const fixed = Number(settings.stripe_fee_fixed || 0);
      finalAmount = (amount + fixed) / (1 - (percentage / 100));
      finalAmount = Math.ceil(finalAmount * 100) / 100;
    }

    console.log(`[create-stripe-session] Criando checkout - Tipo: ${type} | R$ ${finalAmount}`);

    const origin = req.headers.get('origin') || 'http://localhost:5173';
    let success_url = `${origin}/?payment=success`;
    let cancel_url = `${origin}/?payment=cancel`;
    
    if ((type === 'venda_bingo' || type === 'venda_rifa') && metadata.codigo) {
        success_url = `${origin}/pagar-cartela?codigo=${metadata.codigo}&payment=success`;
        cancel_url = `${origin}/pagar-cartela?codigo=${metadata.codigo}`;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: type === 'credits' ? 'Créditos Bingo Show' : 'Validação de Cartela (Bingo Show)',
            },
            unit_amount: Math.round(finalAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url,
      cancel_url,
      customer_email: user?.email || undefined,
      client_reference_id: user?.id || 'anonymous',
      metadata: {
        ...metadata,
        user_id: user?.id || 'anonymous',
        payment_type: type,
        original_amount: amount
      },
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('[create-stripe-session] 💥 FATAL ERROR:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})