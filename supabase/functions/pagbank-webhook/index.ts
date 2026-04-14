import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    // O PagBank envia os detalhes do pagamento no objeto "charges" dentro do order
    const charge = payload.charges?.[0] || payload;
    const status = charge.status;
    const reference_id = charge.reference_id || payload.reference_id;

    if (!reference_id) {
      return new Response('No reference_id', { status: 200, headers: corsHeaders });
    }

    // Busca a intenção de pagamento no nosso banco
    const { data: paymentIntent } = await supabaseAdmin
      .from('pagbank_payments')
      .select('*')
      .eq('reference_id', reference_id)
      .single();

    if (!paymentIntent || paymentIntent.status === 'PAID') {
      return new Response('Not found or already processed', { status: 200, headers: corsHeaders });
    }

    if (['PAID', 'COMPLETED', 'AUTHORIZED'].includes(status)) {
        // Marca a intenção como paga para evitar processamento duplo (Idempotência)
        await supabaseAdmin.from('pagbank_payments').update({ status: 'PAID', updated_at: new Date().toISOString() }).eq('id', paymentIntent.id);

        const { data: settings } = await supabaseAdmin.from('configuracoes').select('id, admin_profit, comissao_vendedor_global').eq('admin_id', paymentIntent.admin_id).single();
        const amountPaid = Number(paymentIntent.amount);

        // 1. Liberação de CRÉDITOS
        if (paymentIntent.payment_type === 'credits' && paymentIntent.user_id) {
            const creditsToGrant = Number(paymentIntent.metadata?.credits_requested || amountPaid);
            
            const { data: profile } = await supabaseAdmin.from('perfis').select('credits').eq('id', paymentIntent.user_id).single();
            if (profile) {
                await supabaseAdmin.from('perfis').update({ credits: Number(profile.credits || 0) + creditsToGrant }).eq('id', paymentIntent.user_id);
            }
            
            if (settings) {
                await supabaseAdmin.from('configuracoes').update({ admin_profit: Number(settings.admin_profit || 0) + amountPaid }).eq('id', settings.id);
            }

            const { data: hist } = await supabaseAdmin.from('solicitacoes_credito').insert({
                player_id: paymentIntent.user_id,
                status: 'approved',
                credits_requested: creditsToGrant,
                credits_granted: creditsToGrant,
                amount_paid: amountPaid,
                receipt_url: `PAGBANK_${paymentIntent.pagbank_order_id}`,
                notes: 'PIX Automático via PagBank',
                resolved_at: new Date().toISOString(),
                repasse_concluido: true,
                admin_id: paymentIntent.admin_id
            }).select('id').single();

            if (hist) {
                await supabaseAdmin.from('mensagens_solicitacao').insert({
                    credit_request_id: hist.id,
                    sender_id: paymentIntent.user_id,
                    message: `✅ Pagamento PIX aprovado e confirmado automaticamente pelo PagBank!`,
                    admin_id: paymentIntent.admin_id
                });
            }
        }
        
        // 2 e 3. Liberação de CARTELAS (Bingo Físico e Rifa)
        else if ((paymentIntent.payment_type === 'venda_bingo' || paymentIntent.payment_type === 'venda_rifa') && paymentIntent.metadata?.venda_id) {
            const isBingo = paymentIntent.payment_type === 'venda_bingo';
            const table = isBingo ? 'vendas_bingo_fisico' : 'compras_rifa';

            const { data: venda } = await supabaseAdmin
              .from(table)
              .select('*, vendedores_rifa(user_id, comissao_percentual)')
              .eq('id', paymentIntent.metadata.venda_id)
              .single();

            if (venda && venda.status !== 'pago') {
                await supabaseAdmin.from(table).update({ status: 'pago' }).eq('id', venda.id);

                // Pote do Bingo
                if (isBingo) {
                    const { data: match } = await supabaseAdmin.from('partidas').select('pot').eq('id', venda.match_id).single();
                    if (match) {
                        await supabaseAdmin.from('partidas').update({ pot: Number(match.pot || 0) + amountPaid }).eq('id', venda.match_id);
                    }
                }

                // Comissão do Vendedor (Online)
                let comissaoValor = 0;
                const vId = isBingo ? venda.vendedor_id : (venda.vendedor_id || venda.ref_vendedor_id);
                if (vId && venda.vendedores_rifa?.user_id) {
                    let comissaoPerc = Number(venda.vendedores_rifa.comissao_percentual || 0);
                    if (comissaoPerc === 0) comissaoPerc = Number(settings?.comissao_vendedor_global || 0);
                    if (comissaoPerc > 0) comissaoValor = amountPaid * (comissaoPerc / 100.0);

                    if (comissaoValor > 0) {
                        const { data: vProf } = await supabaseAdmin.from('perfis').select('credits').eq('id', venda.vendedores_rifa.user_id).single();
                        if (vProf) {
                            await supabaseAdmin.from('perfis').update({ credits: Number(vProf.credits || 0) + comissaoValor }).eq('id', venda.vendedores_rifa.user_id);
                        }
                    }
                }

                // Lucro Admin
                if (settings) {
                    await supabaseAdmin.from('configuracoes').update({ admin_profit: Number(settings.admin_profit || 0) + (amountPaid - comissaoValor) }).eq('id', settings.id);
                }
            }
        }
    } else {
        // Se não foi pago, apenas atualiza o status (ex: WAITING)
        await supabaseAdmin.from('pagbank_payments').update({ status: status, updated_at: new Date().toISOString() }).eq('id', paymentIntent.id);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error("Webhook Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});