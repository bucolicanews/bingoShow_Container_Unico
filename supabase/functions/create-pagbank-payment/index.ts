import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { amount, type, metadata, admin_id, payment_method = 'pix' } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let configQuery = supabaseAdmin.from('configuracoes').select('admin_id, pagbank_env, pagbank_token_sandbox, pagbank_token_producao, pagbank_pass_fees_to_customer, pagbank_pix_fee_percentage, pagbank_card_fee_percentage, pagbank_pix_fee_fixed, pagbank_card_fee_fixed');
    if (admin_id) {
        configQuery = configQuery.eq('admin_id', admin_id);
    }
    const { data: config, error: configError } = await configQuery.limit(1).single();

    if (configError || !config) throw new Error("Configurações não encontradas no sistema.");

    const isProd = config.pagbank_env === 'producao';
    const token = (isProd ? config.pagbank_token_producao : config.pagbank_token_sandbox)?.trim();
    const apiUrl = isProd ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';

    if (!token) throw new Error(`Token do PagBank não configurado para o ambiente: ${config.pagbank_env}`);

    const authHeader = req.headers.get('Authorization');
    let user_id = null;
    let customerName = 'Cliente Bingo Show';
    let customerEmail = 'cliente@bingoshow.com';
    let customerTaxId = '12345678909'; 
    let phoneArea = "11";
    let phoneNumber = "999999999";

    const applyPhone = (rawPhone: string) => {
        if (!rawPhone) return;
        let clean = rawPhone.replace(/\D/g, '');
        if (clean.startsWith('55') && clean.length > 12) clean = clean.substring(2);
        if (clean.length >= 10 && clean.length <= 11) {
            phoneArea = clean.substring(0, 2);
            phoneNumber = clean.substring(2);
        }
    };

    if (authHeader && authHeader !== 'Bearer null' && authHeader !== 'null') {
        const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
        const { data: { user } } = await userClient.auth.getUser();
        if (user) {
            user_id = user.id;
            customerEmail = user.email || customerEmail;
            const { data: profile } = await supabaseAdmin.from('perfis').select('full_name, cpf, whatsapp').eq('id', user.id).single();
            if (profile) {
                customerName = profile.full_name || customerName;
                if (profile.cpf) customerTaxId = profile.cpf.replace(/\D/g, '');
                applyPhone(profile.whatsapp || '');
            }
        }
    }

    if (metadata?.cliente_nome) customerName = metadata.cliente_nome;
    if (metadata?.customer_cpf) {
        customerTaxId = metadata.customer_cpf.replace(/\D/g, '');
        if (user_id && (customerTaxId.length === 11 || customerTaxId.length === 14)) {
            supabaseAdmin.from('perfis').update({ cpf: customerTaxId }).eq('id', user_id).then(({error}) => { if(error) console.error("Erro update CPF:", error) });
        }
    }
    if (metadata?.cliente_telefone) applyPhone(metadata.cliente_telefone);

    if (!customerTaxId || (customerTaxId.length !== 11 && customerTaxId.length !== 14)) {
        throw new Error("CPF_REQUIRED: O Banco exige um CPF ou CNPJ válido matematicamente.");
    }

    let finalName = customerName.trim();
    if (!finalName.includes(' ')) finalName = `${finalName} Cliente`;

    let finalAmount = Number(amount);
    if (config.pagbank_pass_fees_to_customer) {
        const feePerc = payment_method === 'pix' ? Number(config.pagbank_pix_fee_percentage || 0) : Number(config.pagbank_card_fee_percentage || 0);
        const feeFixed = payment_method === 'pix' ? Number(config.pagbank_pix_fee_fixed || 0) : Number(config.pagbank_card_fee_fixed || 0);
        finalAmount = (finalAmount + feeFixed) / (1 - (feePerc / 100));
        finalAmount = Math.ceil(finalAmount * 100) / 100;
    }

    const valorEmCentavos = Math.round(finalAmount * 100);
    const reference_id = `${type.toUpperCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const itemName = type === 'credits' ? 'Créditos Bingo Show' : 'Bilhete Bingo Show';

    try {
      if (type === 'venda_bingo' && metadata?.venda_id) {
          await supabaseAdmin.from('vendas_bingo_fisico').update({ nome_comprador: finalName, telefone_comprador: metadata?.cliente_telefone || null }).eq('id', metadata.venda_id);
      } else if (type === 'venda_rifa' && metadata?.venda_id) {
          const { data: cartela } = await supabaseAdmin.from('cartelas_rifa').select('numero_rifa_id').eq('compra_id', metadata.venda_id).maybeSingle();
          if (cartela?.numero_rifa_id) await supabaseAdmin.from('numeros_rifa').update({ nome_comprador: finalName, telefone_comprador: metadata?.cliente_telefone || null }).eq('id', cartela.numero_rifa_id);
      }
    } catch (err) {}

    let responseData;
    let pagbank_order_id = '';
    let qr_code = null;
    let qr_code_text = null;
    let checkout_link = null;

    // FLUXO CARTÃO (CHECKOUT API)
    if (payment_method === 'CREDIT_CARD') {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 7);

        // PAYLOAD 100% IDÊNTICO AO APLICATIVO FUNCIONAL DO USUÁRIO
        const checkoutPayload = {
            reference_id: reference_id,
            expiration_date: expirationDate.toISOString(),
            customer: { 
                name: finalName, 
                email: customerEmail, 
                tax_id: customerTaxId,
                phones: [{ country: "55", area: phoneArea, number: phoneNumber, type: "MOBILE" }]
            },
            items: [{ reference_id: `ITEM_${reference_id}`, name: itemName, quantity: 1, unit_amount: valorEmCentavos }],
            notification_urls: [`${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`]
        };

        console.log(`[create-pagbank-payment] Payload Checkout enviado:`, JSON.stringify(checkoutPayload));

        const response = await fetch(`${apiUrl}/checkouts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'x-api-version': '4.0' },
            body: JSON.stringify(checkoutPayload)
        });

        responseData = await response.json();

        if (!response.ok) {
            console.error("[create-pagbank-payment] Erro PagBank Checkout:", JSON.stringify(responseData));
            const errDesc = responseData.error_messages?.[0]?.description || "";
            const errParam = responseData.error_messages?.[0]?.parameter_name || "Desconhecido";
            throw new Error(`Erro API PagBank [${errParam}]: ${errDesc}`);
        }

        pagbank_order_id = responseData.id;
        checkout_link = responseData.links?.find((l: any) => l.rel === 'PAY')?.href;
        
        if (!checkout_link) throw new Error("Link de checkout não retornado pelo PagBank.");
    } 
    // FLUXO PIX (ORDERS API)
    else {
        const orderPayload = {
          reference_id: reference_id,
          customer: { name: finalName, email: customerEmail, tax_id: customerTaxId },
          items: [{ name: itemName, quantity: 1, unit_amount: valorEmCentavos }],
          qr_codes: [{ amount: { value: valorEmCentavos }, expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }],
          notification_urls: [`${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`]
        };

        const response = await fetch(`${apiUrl}/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'x-api-version': '4.0' },
            body: JSON.stringify(orderPayload)
        });

        responseData = await response.json();

        if (!response.ok) {
            const errDesc = responseData.error_messages?.[0]?.description || "";
            if (errDesc.includes("CPF") || errDesc.includes("CNPJ") || responseData.error_messages?.[0]?.code === "40002") {
                throw new Error("CPF_REQUIRED: O Banco exige um CPF válido matematicamente.");
            }
            throw new Error(`Erro API PagBank: ${errDesc}`);
        }

        pagbank_order_id = responseData.id;
        qr_code = responseData.qr_codes?.[0]?.links?.find((l: any) => l.media === 'image/png')?.href;
        qr_code_text = responseData.qr_codes?.[0]?.text;

        if (!qr_code || !qr_code_text) throw new Error("PagBank não retornou os dados do QR Code.");
    }

    await supabaseAdmin.from('pagbank_payments').insert({
        user_id: user_id,
        reference_id: reference_id,
        pagbank_order_id: pagbank_order_id,
        amount: amount,
        status: 'PENDING',
        payment_type: type,
        metadata: { ...metadata, origin_amount: amount, calculated_fee: (finalAmount - amount) },
        admin_id: config.admin_id
    });

    return new Response(JSON.stringify({ 
      success: true, qr_code, qr_code_text, checkout_link, order_id: pagbank_order_id 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error: any) {
    console.error("[create-pagbank-payment] Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
})