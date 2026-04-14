import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import Stripe from 'npm:stripe@16.10.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  const { data: settings } = await supabaseAdmin
    .from('configuracoes')
    .select('id, stripe_secret_key, stripe_webhook_secret, stripe_secret_key_test, stripe_webhook_secret_test, stripe_env, comissao_vendedor_global, admin_profit')
    .limit(1)
    .maybeSingle();

  const isLiveMode = settings?.stripe_env === 'live';
  const secretKey = isLiveMode ? settings?.stripe_secret_key : settings?.stripe_secret_key_test;
  const webhookSecret = isLiveMode ? settings?.stripe_webhook_secret : settings?.stripe_webhook_secret_test;

  if (!secretKey || !webhookSecret) {
      console.error(`[stripe-webhook] Erro: Chaves do Stripe para o ambiente '${settings?.stripe_env}' não configuradas.`);
      return new Response('Config Error', { status: 500 });
  }

  const stripe = new Stripe(secretKey.trim(), {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
      return new Response('No signature', { status: 400 });
  }

  try {
    const body = await req.text()
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret.trim())

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object
      
      if (session.payment_status === 'paid') {
        const userId = session.client_reference_id || session.metadata?.user_id || 'anonymous';
        let paymentType = session.metadata?.payment_type;
        const amountPaidByCustomer = session.amount_total ? session.amount_total / 100 : 0;
        const originalAmount = session.metadata?.original_amount ? Number(session.metadata.original_amount) : amountPaidByCustomer;

        // *** BLINDAGEM DE SEGURANÇA ***
        if (session.metadata?.credits_requested) {
            paymentType = 'credits';
        }

        console.log(`[stripe-webhook] Tipo (Após Verificação): ${paymentType} | Usr: ${userId} | Valor Original: R$ ${originalAmount}`);

        // Previne duplicidade
        const { data: existing } = await supabaseAdmin.from('stripe_payments').select('status').eq('stripe_session_id', session.id).maybeSingle();
        if (existing?.status === 'completed') {
            return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
        }

        await supabaseAdmin.from('stripe_payments').insert({ 
            stripe_session_id: session.id, user_id: userId === 'anonymous' ? null : userId,
            amount: amountPaidByCustomer, status: 'completed', payment_type: paymentType || 'unknown'
        });

        // =========================================================
        // 1. COMPRA DE CRÉDITOS (ADICIONAR SALDO)
        // =========================================================
        if (paymentType === 'credits' && userId !== 'anonymous') {
          const creditsToGrant = Number(session.metadata?.credits_requested || originalAmount);
          
          const { data: profile } = await supabaseAdmin.from('perfis').select('credits').eq('id', userId).single();
          if (profile) await supabaseAdmin.from('perfis').update({ credits: Number(profile.credits || 0) + creditsToGrant }).eq('id', userId);

          await supabaseAdmin.from('configuracoes').update({ admin_profit: Number(settings.admin_profit || 0) + originalAmount }).eq('id', settings.id);

          const { data: historyData } = await supabaseAdmin.from('solicitacoes_credito').insert({
            player_id: userId, status: 'approved', credits_requested: creditsToGrant, credits_granted: creditsToGrant,
            amount_paid: amountPaidByCustomer, receipt_url: `STRIPE_${session.id}`, notes: 'Pagamento via Cartão (Stripe)', resolved_at: new Date().toISOString(), repasse_concluido: true
          }).select('id').single();

          if (historyData) await supabaseAdmin.from('mensagens_solicitacao').insert({ credit_request_id: historyData.id, sender_id: userId, message: `✅ Pagamento de R$ ${amountPaidByCustomer.toFixed(2)} aprovado no Cartão.` });
        } 
        
        // =========================================================
        // 2. PAGAMENTO DE CARTELA FÍSICA (BINGO)
        // =========================================================
        else if (paymentType === 'venda_bingo' && session.metadata?.venda_id) {
            const vendaId = session.metadata.venda_id;
            const { data: venda } = await supabaseAdmin.from('vendas_bingo_fisico').select('*, vendedores_rifa(user_id, comissao_percentual)').eq('id', vendaId).single();

            if (venda && venda.status !== 'pago') {
                await supabaseAdmin.from('vendas_bingo_fisico').update({ status: 'pago' }).eq('id', vendaId);
                
                const { data: match } = await supabaseAdmin.from('partidas').select('pot').eq('id', venda.match_id).single();
                if (match) await supabaseAdmin.from('partidas').update({ pot: Number(match.pot || 0) + originalAmount }).eq('id', venda.match_id);

                let comissaoValor = 0;
                if (venda.vendedor_id && venda.vendedores_rifa?.user_id) {
                    let comissaoPerc = Number(venda.vendedores_rifa.comissao_percentual || 0);
                    if (comissaoPerc === 0) comissaoPerc = Number(settings.comissao_vendedor_global || 0);
                    if (comissaoPerc > 0) comissaoValor = originalAmount * (comissaoPerc / 100.0);
                    
                    if (comissaoValor > 0) {
                        const { data: vProfile } = await supabaseAdmin.from('perfis').select('credits').eq('id', venda.vendedores_rifa.user_id).single();
                        if (vProfile) await supabaseAdmin.from('perfis').update({ credits: Number(vProfile.credits || 0) + comissaoValor }).eq('id', venda.vendedores_rifa.user_id);
                    }
                }
                
                const lucroAdmin = originalAmount - comissaoValor;
                await supabaseAdmin.from('configuracoes').update({ admin_profit: Number(settings.admin_profit || 0) + lucroAdmin }).eq('id', settings.id);
            }
        }

        // =========================================================
        // 3. PAGAMENTO DE RIFA
        // =========================================================
        else if (paymentType === 'venda_rifa' && session.metadata?.venda_id) {
            const vendaId = session.metadata.venda_id;
            const { data: compra } = await supabaseAdmin.from('compras_rifa').select('*, vendedores_rifa(user_id, comissao_percentual)').eq('id', vendaId).single();

            if (compra && compra.status !== 'pago') {
                await supabaseAdmin.from('compras_rifa').update({ status: 'pago' }).eq('id', vendaId);

                let comissaoValor = 0;
                const vId = compra.vendedor_id || compra.ref_vendedor_id;
                if (vId && compra.vendedores_rifa?.user_id) {
                    let comissaoPerc = Number(compra.vendedores_rifa.comissao_percentual || 0);
                    if (comissaoPerc === 0) comissaoPerc = Number(settings.comissao_vendedor_global || 0);
                    if (comissaoPerc > 0) comissaoValor = originalAmount * (comissaoPerc / 100.0);
                    
                    if (comissaoValor > 0) {
                        const { data: vProfile } = await supabaseAdmin.from('perfis').select('credits').eq('id', compra.vendedores_rifa.user_id).single();
                        if (vProfile) await supabaseAdmin.from('perfis').update({ credits: Number(vProfile.credits || 0) + comissaoValor }).eq('id', compra.vendedores_rifa.user_id);
                    }
                }
                
                const lucroAdmin = originalAmount - comissaoValor;
                await supabaseAdmin.from('configuracoes').update({ admin_profit: Number(settings.admin_profit || 0) + lucroAdmin }).eq('id', settings.id);
            }
        }
      } 
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders })
  } catch (err: any) {
    console.error(`[stripe-webhook] Erro: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400, headers: corsHeaders })
  }
})