check-pending-payments

import { serve } from '<https://deno.land/std@0.190.0/http/server.ts>';
import { createClient } from '<https://esm.sh/@supabase/supabase-js@2.39.3>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jobId = crypto.randomUUID().substring(0, 8);
  console.log(`[fallback:${jobId}] Iniciando verificação automática...`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Busca parcelas pendentes com PagBank não verificadas recentemente
    const { data: parcelas, error: fetchError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('id, admin_id, pagbank_checkout_id, pagbank_charge_id, valor_parcela, last_check_at')
      .in('status', ['aberta', 'parcial', 'reprogramada'])
      .not('pagbank_checkout_id', 'is', null)
      .or(`last_check_at.is.null,last_check_at.lt.${fiveMinutesAgo}`)
      .limit(50);

    if (fetchError || !parcelas) throw fetchError || new Error('Nenhuma parcela encontrada.');

    let paidCount = 0;

    for (const parcela of parcelas) {
      try {
        const { data: config } = await supabaseAdmin
          .from('configuracoes_pagbank')
          .select('*')
          .eq('proprietario_id', parcela.admin_id)
          .single();

        if (!config) continue;

        const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
        const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';

        if (!token) continue;

        const resourceId = parcela.pagbank_checkout_id || parcela.pagbank_charge_id;
        const endpoint = parcela.pagbank_checkout_id ? `${baseUrl}/checkouts/${resourceId}` : `${baseUrl}/orders/${resourceId}`;

        const response = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });

        // Marcar verificação
        await supabaseAdmin.from('admin_parcelas_receber').update({ last_check_at: new Date().toISOString() }).eq('id', parcela.id);

        if (!response.ok) continue;

        const data = await response.json();
        let isPaid = false;
        let chargeData = null;

        if (parcela.pagbank_checkout_id) {
          if (data.orders?.length > 0) {
            chargeData = data.orders.find((o: any) => ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(o.status));
            if (chargeData) isPaid = true;
          }
        } else {
          isPaid = ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(data.status);
          chargeData = data;
        }

        if (isPaid && chargeData) {
          // Chama o webhook internamente para processar a baixa
          const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`;
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` 
            },
            body: JSON.stringify({
              reference_id: `PARCELA_${parcela.id}`,
              status: 'PAID',
              id: chargeData.id,
              amount: { value: Math.round(parcela.valor_parcela * 100) },
              paid_at: chargeData.paid_at || new Date().toISOString(),
              charges: chargeData.charges || []
            })
          });
          paidCount++;
          console.log(`[fallback:${jobId}] Parcela ${parcela.id} baixada via verificação automática.`);
        }
      } catch (err) {
        console.error(`[fallback:${jobId}] Erro na parcela ${parcela.id}:`, err.message);
      }
    }

    return new Response(JSON.stringify({ success: true, checked: parcelas.length, paid: paidCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error: any) {
    console.error(`[fallback:${jobId}] Fatal Error:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});

create-pagbank-checkout

import { serve } from '<https://deno.land/std@0.190.0/http/server.ts>'
import { createClient } from '<https://esm.sh/@supabase/supabase-js@2>'
import { corsHeaders } from '../_shared/cors.ts'

interface Parcela {
  id: string;
  valor_parcela: number;
  data_vencimento: string;
  admin_contas_receber: {
    descricao: string;
    cliente_id: string;
  };
}

interface Cliente {
  nome: string;
  email: string;
  documento: string;
  telefone: string;
}

interface PagBankConfig {
  ambiente: 'sandbox' | 'producao';
  token_producao: string | null;
  token_sandbox: string | null;
  dias_expiracao_link: number;
  webhook_url: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { parcela_id, admin_id } = await req.json();
    if (!parcela_id || !admin_id) {
      throw new Error('ID da parcela e do admin são obrigatórios.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar dados da parcela e do cliente
    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        id, valor_parcela, data_vencimento,
        admin_contas_receber ( descricao, cliente_id )
      `)
      .eq('id', parcela_id)
      .single();

    if (parcelaError || !parcela) throw new Error('Parcela não encontrada.');

    const clienteId = parcela.admin_contas_receber?.cliente_id;
    if (!clienteId) throw new Error('Cliente não associado à conta a receber.');

    const { data: cliente, error: clienteError } = await supabaseAdmin
      .from('tbl_clientes')
      .select('nome, email, documento, telefone')
      .eq('id', clienteId)
      .single();

    if (clienteError || !cliente) throw new Error('Dados do cliente não encontrados.');

    // 2. Buscar configuração do PagBank
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (configError || !config) throw new Error('Configuração do PagBank não encontrada.');

    const isProd = config.ambiente === 'producao';
    // ✅ CORREÇÃO: Adicionado .trim() para remover espaços acidentais
    const apiToken = (isProd ? config.token_producao : config.token_sandbox)?.trim();
    const apiUrl = isProd ? 'https://api.pagseguro.com' : 'https://api.sandbox.pagseguro.com';

    if (!apiToken) throw new Error(`Token do PagBank para ambiente de ${config.ambiente} não configurado.`);

    // 3. Montar payload para a API do PagBank
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + (config.dias_expiracao_link || 7));

    const payload = {
      reference_id: `PARCELA_${parcela.id}`,
      expiration_date: expirationDate.toISOString(),
      customer: {
        name: cliente.nome,
        email: cliente.email,
        tax_id: cliente.documento.replace(/\D/g, ''),
        phones: cliente.telefone ? [{
          country: "55",
          area: cliente.telefone.replace(/\D/g, '').substring(0, 2),
          number: cliente.telefone.replace(/\D/g, '').substring(2),
          type: "MOBILE"
        }] : undefined,
      },
      items: [{
        reference_id: `ITEM_${parcela.id}`,
        name: `Parcela - ${parcela.admin_contas_receber.descricao}`,
        quantity: 1,
        unit_amount: Math.round(parcela.valor_parcela * 100),
      }],
      notification_urls: [config.webhook_url],
    };

    // 4. Chamar a API do PagBank para criar o CHECKOUT
    const response = await fetch(`${apiUrl}/checkouts`, {
      method: 'POST',
      headers: {
        // ✅ CORREÇÃO: Adicionado o prefixo "Bearer "
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'x-api-version': '4.0',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("[create-pagbank-checkout] Erro da API PagBank:", responseData);
      throw new Error(responseData.error_messages?.[0]?.description || 'Erro ao criar checkout no PagBank');
    }

    const checkoutLink = responseData.links?.find((l: any) => l.rel === 'PAY')?.href;
    const checkoutId = responseData.id; // ID do Checkout (CHK_...)

    if (!checkoutLink || !checkoutId) {
      throw new Error('Link de checkout ou ID do pedido não retornado pelo PagBank.');
    }

    // 5. Atualizar a parcela com o ID do Checkout e o link de checkout
    const { error: updateError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({
        pagbank_checkout_id: checkoutId, // Salva o ID do Checkout
        pagbank_checkout_link: checkoutLink,
        pagbank_status: 'WAITING',
        pagbank_updated_at: new Date().toISOString(),
        pagbank_link_expira_em: expirationDate.toISOString(),
      })
      .eq('id', parcela_id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, checkout_link: checkoutLink, cliente }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[create-pagbank-checkout] Erro geral:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

create-pagbank-payment

import { serve } from '<https://deno.land/std@0.190.0/http/server.ts>';
import { createClient } from '<https://esm.sh/@supabase/supabase-js@2.39.3>';
import { PagBankClient } from '../_shared/pagbank-client.ts';
import { CreateChargeRequest } from '../_shared/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { parcela_id, payment_method, admin_id } = await req.json();

    // 1. Buscar parcela e dados do cliente
    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          *,
          tbl_clientes ( nome, email, cpf, cnpj, documento, telefone, cep, endereco, numero, bairro, cidade, estado )
        )
      `)
      .eq('id', parcela_id)
      .single();

    if (parcelaError || !parcela) throw new Error('Parcela não encontrada');

    const { data: config } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (!config) throw new Error('Configuração PagBank não encontrada.');

    const cliente = parcela.admin_contas_receber?.tbl_clientes;
    if (!cliente) throw new Error('Dados do cliente não encontrados.');

    const valorEmCentavos = Math.round(parcela.valor_parcela * 100);
    
    // 2. Processar Token e URL
    const rawToken = config.ambiente === 'producao' ? config.token_producao : config.token_sandbox;
    const token = (rawToken || '').trim();
    
    if (!token) throw new Error(`Token de ${config.ambiente} não configurado.`);
    
    console.log(`[create-pagbank-payment] Ambiente: ${config.ambiente}. Token status: ${token.length > 10 ? 'Found' : 'Missing/Short'}`);

    // 3. Preparar Request
    let taxId = (cliente.cpf || cliente.cnpj || cliente.documento || '').replace(/\D/g, '');

    console.log('[create-pagbank-payment] Cliente:', {
      nome: cliente.nome,
      cpf: cliente.cpf,
      cnpj: cliente.cnpj,
      documento: cliente.documento,
      taxId_final: taxId
    });

    // Validar se taxId existe e tem tamanho válido (11 para CPF ou 14 para CNPJ)
    if (!taxId || (taxId.length !== 11 && taxId.length !== 14)) {
      throw new Error(`❌ Verifique o cadastro do cliente!\n\nCliente: "${cliente.nome}"\nProblema: CPF/CNPJ ${!taxId ? 'não informado' : 'inválido'}${taxId ? ` (${taxId.length} dígitos)` : ''}.\n\n✅ Solução: Acesse o cadastro do cliente e preencha um CPF válido (11 dígitos) ou CNPJ válido (14 dígitos).`);
    }

    let nomeCliente = cliente.nome.trim();
    if (!nomeCliente.includes(' ')) nomeCliente += ' Cliente';

    const webhookUrl = config.webhook_url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`;

    const chargeRequest: CreateChargeRequest = {
      reference_id: `PARCELA_${parcela_id}`,
      customer: {
        name: nomeCliente,
        email: cliente.email || 'cobranca@jotaempresas.com',
        tax_id: taxId,
      },
      items: [{
        name: `Parcela ${parcela.numero_parcela} - ${parcela.admin_contas_receber.descricao}`,
        quantity: 1,
        unit_amount: valorEmCentavos,
      }],
      notification_urls: [webhookUrl],
    };

    if (payment_method === 'pix') {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      
      const vencimentoParcela = new Date(parcela.data_vencimento);
      vencimentoParcela.setHours(23, 59, 59, 999); // Final do dia
      
      let dataExpiracao: Date;
      
      // Se a parcela ainda não venceu, usa a data de vencimento
      if (vencimentoParcela > hoje) {
        dataExpiracao = vencimentoParcela;
        console.log(`[create-pagbank-payment] Parcela não vencida. Expira em: ${dataExpiracao.toISOString()}`);
      } else {
        // Se já venceu, usa 7 dias a partir de hoje (ou configurável)
        dataExpiracao = new Date(hoje);
        dataExpiracao.setDate(dataExpiracao.getDate() + 7);
        dataExpiracao.setHours(23, 59, 59, 999);
        console.log(`[create-pagbank-payment] Parcela vencida. Expira em D+7: ${dataExpiracao.toISOString()}`);
      }
      
      chargeRequest.qr_codes = [{ 
        amount: { value: valorEmCentavos }, 
        expiration_date: dataExpiracao.toISOString() 
      }];
    }

    // 4. Executar PagBank Client
    const pagbankClient = new PagBankClient(config as any);
    const chargeResponse = await pagbankClient.createCharge(chargeRequest);

    const qrCode = chargeResponse.qr_codes?.[0]?.links?.find((link: any) => link.media === 'image/png')?.href || null;
    const qrCodeText = chargeResponse.qr_codes?.[0]?.text || null;

    // Gerar URL da página de pagamento (apenas para PIX)
    const pixPaymentPageUrl = payment_method === 'pix' 
      ? `${Deno.env.get('NEXT_PUBLIC_APP_URL') || 'http://localhost:8080'}/pix/${parcela_id}`
      : null;

    // 5. Salvar no banco
    const updateData: any = {
      pagbank_charge_id: chargeResponse.id,
      pagbank_payment_method: payment_method,
      pagbank_status: chargeResponse.status,
      pagbank_updated_at: new Date().toISOString(),
    };

    if (payment_method === 'pix') {
      updateData.pagbank_qr_code = qrCode;
      updateData.pagbank_qr_code_text = qrCodeText;
      updateData.pagbank_payment_link = pixPaymentPageUrl;
      
      // Salvar data de expiração do PIX
      const dataExpiracao = chargeRequest.qr_codes?.[0]?.expiration_date;
      if (dataExpiracao) {
        updateData.pagbank_link_expira_em = dataExpiracao;
      }
    }

    await supabaseAdmin.from('admin_parcelas_receber').update(updateData).eq('id', parcela_id);

    // 6. Log de auditoria
    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: admin_id,
      transaction_type: 'payment',
      pagbank_id: chargeResponse.id,
      reference_id: `PARCELA_${parcela_id}`,
      status: chargeResponse.status,
      amount: parcela.valor_parcela,
      request_payload: chargeRequest,
      response_payload: chargeResponse,
    });

    // 7. Preparar resposta de acordo com o método
    const responseData: any = { 
      success: true, 
      charge_id: chargeResponse.id,
      cliente: { nome: cliente.nome, email: cliente.email, telefone: cliente.telefone }
    };

    if (payment_method === 'pix') {
      responseData.qr_code = qrCode;
      responseData.qr_code_text = qrCodeText;
      responseData.pix_payment_page_url = pixPaymentPageUrl;
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('PagBank Payment Error:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
create-pagbank-transfer

import { serve } from '<https://deno.land/std@0.190.0/http/server.ts>';
import { createClient } from '<https://esm.sh/@supabase/supabase-js@2.39.3>';
import { PagBankClient } from '../_shared/pagbank-client.ts';
import { CreateTransferRequest } from '../_shared/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { parcelaId, amount, holder, tax_id, bank, branch, account, account_type } = body;

    const { data: parcela } = await supabaseAdmin.from('admin_parcelas_pagar').select('*').eq('id', parcelaId).single();
    if (!parcela) throw new Error('Parcela não encontrada');

    const { data: config } = await supabaseAdmin.from('configuracoes_pagbank').select('*').eq('proprietario_id', parcela.admin_id).single();
    if (!config) throw new Error('Configuração PagBank não encontrada');

    const request: CreateTransferRequest = {
      reference_id: `PAGAMENTO_${parcelaId}`,
      amount: { value: Math.round(amount * 100) },
      recipient: {
        bank_account: {
          holder,
          tax_id: tax_id.replace(/\D/g, ''),
          bank,
          branch,
          account,
          type: account_type,
        }
      }
    };

    const client = new PagBankClient(config);
    const response = await client.createTransfer(request);

    await supabaseAdmin.from('admin_parcelas_pagar').update({
      pagbank_transfer_id: response.id,
      pagbank_status: response.status
    }).eq('id', parcelaId);

    return new Response(JSON.stringify(response), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

sync-pagbank-transactions

import { serve } from "<https://deno.land/std@0.190.0/http/server.ts>"
import { createClient } from "<https://esm.sh/@supabase/supabase-js@2.45.0>"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  // 1. Trata Pre-flight (CORS)
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { parcelaId, manualOrderId } = await req.json()

    if (!parcelaId) {
      throw new Error("parcelaId não informado")
    }

    // 2. Busca a parcela
    const { data: parcela, error } = await supabase
      .from("admin_parcelas_receber")
      .select("*, admin_contas_receber(admin_id, cliente_id)")
      .eq("id", parcelaId)
      .single()

    if (error || !parcela) {
      throw new Error("Parcela não encontrada")
    }

    const ownerId = parcela.admin_contas_receber.admin_id
    
    // 3. Define qual ID usar:
    // - CHEC_ (checkout) NÃO é consultável diretamente; usa o pagbank_charge_id (ORDE_/ORD_) gerado pelo checkout
    // - Prioridade: manual > charge_id > checkout_id (somente se não for CHEC_)
    const checkoutId = parcela.pagbank_checkout_id
    const isChecCheckout = checkoutId?.startsWith("CHEC_")
    const transactionId = manualOrderId
      || parcela.pagbank_charge_id
      || (!isChecCheckout ? checkoutId : null)

    if (!transactionId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Parcela sem ID de transação (Order/Charge) e nenhum código manual informado." 
        }),
        { 
          status: 200, // Retorna 200 para o frontend tratar a mensagem
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      )
    }

    // 4. Busca Configuração
    const { data: config } = await supabase
      .from("configuracoes_pagbank")
      .select("*")
      .eq("proprietario_id", ownerId)
      .single()

    if (!config) throw new Error("Configuração PagBank não encontrada")

    const token = (config.ambiente === "producao" ? config.token_producao : config.token_sandbox)?.trim()
    
    // URL DEFINITIVA: api.pagseguro.com (NUNCA api.pagbank.com.br)
    const baseUrl = config.ambiente === "producao" 
      ? "https://api.pagseguro.com" 
      : "https://sandbox.api.pagseguro.com"

    // Detecta o tipo de ID para usar o endpoint correto da API PagBank:
    // CHAR_ → boleto ou PIX (charge direta) → /charges/
    // ORD_  → order criado via API           → /orders/
    // ORDE_ → order (variação do prefixo)    → /orders/
    // CHK_  → checkout (link de pagamento)   → /orders/
    // CHEC_ → checkout (variação do prefixo) → /orders/
    // sem prefixo conhecido                  → /charges/ (fallback conservador)
    const isCharge = transactionId.startsWith("CHAR_")
    const isOrder  = !isCharge && (
      transactionId.startsWith("ORD_")  ||
      transactionId.startsWith("ORDE_") ||
      transactionId.startsWith("CHK_")  ||
      transactionId.startsWith("CHEC_")
    )
    const endpoint = isOrder ? `/orders/${transactionId}` : `/charges/${transactionId}`
    const fullUrl = `${baseUrl}${endpoint}`

    console.log(`[sync-pagbank] Requesting: ${fullUrl}`)

    // 5. Chamada à API PagBank
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "*/*",
        "x-api-version": "4.0"
      },
    })

    if (!response.ok) {
      const rawText = await response.text()
      console.error(`[sync-pagbank] ${response.status} para ${fullUrl} — body: ${rawText}`)
      let errorMsg = `PagBank ${response.status}`
      try {
        const jsonErr = JSON.parse(rawText)
        errorMsg = jsonErr.error_messages?.[0]?.description || jsonErr.message || errorMsg
      } catch {
        errorMsg += rawText ? `: ${rawText}` : " (sem corpo na resposta)"
      }
      throw new Error(errorMsg)
    }

    const pbData = await response.json()
    
    // 6. Normaliza dados de retorno
    let status = pbData.status
    let paidAt = pbData.paid_at
    let grossAmount = 0
    let fees = 0
    let chargeIdFound = isOrder ? null : transactionId

    if (pbData.charges && pbData.charges.length > 0) {
      // Se for Order, pega a charge paga ou a mais recente
      const charge = pbData.charges.find((c: any) => c.status === "PAID") || pbData.charges[0]
      status = charge.status
      paidAt = charge.paid_at
      grossAmount = charge.amount?.value || 0
      fees = charge.amount?.summary?.total_fee || 0
      chargeIdFound = charge.id
    } else {
      // Se for Charge direto
      grossAmount = pbData.amount?.value || 0
      fees = pbData.amount?.summary?.total_fee || 0
    }

    const isPaid = status === "PAID"

    // 7. Processa Baixa se Pago
    if (isPaid && parcela.status !== "paga") {
      const { data: saldoConta } = await supabase
        .from("saldo_contas")
        .select("id")
        .eq("proprietario_id", ownerId)
        .eq("conta_contabil_id", config.conta_id)
        .maybeSingle()

      if (!saldoConta) throw new Error("Conta bancária não encontrada no sistema.")

      const valorBruto = grossAmount / 100
      const valorTaxa = fees / 100
      const valorLiquido = valorBruto - valorTaxa

      // Atualiza parcela
      await supabase.from("admin_parcelas_receber").update({
        status: "paga",
        valor_pago: valorBruto,
        data_pagamento: paidAt || new Date().toISOString(),
        pagbank_status: "PAID",
        pagbank_charge_id: chargeIdFound,
        pagbank_updated_at: new Date().toISOString()
      }).eq("id", parcelaId)

      // Cria recebimento
      await supabase.from("admin_recebimentos").insert({
        parcela_id: parcelaId,
        admin_id: ownerId,
        cliente_id: parcela.admin_contas_receber.cliente_id,
        valor_recebido: valorBruto,
        data_recebimento: paidAt || new Date().toISOString(),
        forma_pagamento: "PagBank",
        conta_id: saldoConta.id,
        id_conta_contabil: config.conta_sintetica_id,
        historico_id: config.historico_padrao_id,
        pagbank_charge_id: chargeIdFound,
        pagbank_taxa_valor: valorTaxa,
        pagbank_valor_liquido: valorLiquido
      })

      return new Response(JSON.stringify({ 
        success: true, 
        isPaid: true, 
        status: "PAID" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      isPaid: false, 
      status: status 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err: any) {
    console.error("[sync-pagbank] Error:", err)
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200, // Retorna 200 com success:false para o frontend ler o erro
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})

pagbank-webhook

import { serve } from '<https://deno.land/std@0.190.0/http/server.ts>'
import { createClient } from '<https://esm.sh/@supabase/supabase-js@2.39.3>'
import { corsHeaders } from '../_shared/cors.ts'

const STATUS_PAGO = ['PAID', 'COMPLETED', 'AVAILABLE']

serve(async (req) => {

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID().substring(0,8)

  console.log(`[pagbank-webhook:${requestId}] Recebido`)

  let payload:any
  let parcela:any
  let supabaseAdmin:any

  try{

    supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const rawBody = await req.text()

    console.log(`[pagbank-webhook:${requestId}] RAW BODY`, rawBody)

    // tentativa de parse JSON
    try{
      payload = JSON.parse(rawBody)
    }
    catch{

      const params = new URLSearchParams(rawBody)

      payload = {
        notificationCode: params.get('notificationCode'),
        notificationType: params.get('notificationType')
      }

    }

    console.log(`[pagbank-webhook:${requestId}] payload inicial`, payload)

    // se veio notificationCode precisamos consultar PagBank
    if(payload.notificationCode){

      console.log(`[pagbank-webhook:${requestId}] buscando dados via notificationCode`)

      const response = await fetch(
        `https://api.pagseguro.com/transactions/notifications/${payload.notificationCode}`,
        {
          headers:{
            Authorization:`Bearer ${Deno.env.get('PAGBANK_TOKEN')}`,
            'Content-Type':'application/json'
          }
        }
      )

      if(!response.ok){

        throw new Error(`Erro consultando PagBank notificationCode ${response.status}`)

      }

      payload = await response.json()

      console.log(`[pagbank-webhook:${requestId}] payload PagBank`,payload)

    }

    const charge = payload.data ?? payload

    const chargeDetail =
      charge.charges?.[0] ??
      charge.payments?.[0] ??
      charge

    const currentStatus = chargeDetail.status ?? charge.status

    const referenceId =
      chargeDetail.reference_id ??
      charge.reference_id ??
      ''

    console.log(`[pagbank-webhook:${requestId}] Status=${currentStatus} Ref=${referenceId}`)

    if(!referenceId || !referenceId.startsWith('PARCELA_')){

      return new Response(JSON.stringify({
        success:true,
        message:'Not parcela reference'
      }),
      {status:200,headers:{...corsHeaders,'Content-Type':'application/json'}})

    }

    let parcelaId = referenceId.replace('PARCELA_','')

    if(parcelaId.includes('_')){

      parcelaId = parcelaId.split('_')[0]

    }

    const {data,error} = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`*, admin_contas_receber(*)`)
      .eq('id',parcelaId)
      .single()

    if(error || !data){

      throw new Error(`Parcela ${parcelaId} não encontrada`)

    }

    parcela = data

    if(parcela.webhook_processed_at){

      console.log(`[pagbank-webhook:${requestId}] parcela já processada`)

      return new Response(JSON.stringify({
        success:true,
        message:'already processed'
      }),
      {status:200,headers:{...corsHeaders,'Content-Type':'application/json'}})

    }

    await supabaseAdmin.from('pagbank_transaction_logs').insert({

      proprietario_id:parcela.admin_id,
      transaction_type:'webhook',
      pagbank_id:charge.id,
      reference_id:referenceId,
      status:currentStatus,
      amount:(chargeDetail.amount?.value || 0)/100,
      response_payload:payload

    })

    if(!STATUS_PAGO.includes(currentStatus)){

      await supabaseAdmin
        .from('admin_parcelas_receber')
        .update({

          pagbank_status:currentStatus,
          pagbank_updated_at:new Date().toISOString()

        })
        .eq('id',parcelaId)

      return new Response(JSON.stringify({
        success:true,
        message:'status intermediário atualizado'
      }),
      {status:200,headers:{...corsHeaders,'Content-Type':'application/json'}})

    }

    const dataPagamento = (chargeDetail.paid_at ?? new Date().toISOString()).split('T')[0]

    const valorBruto = (chargeDetail.amount?.value || 0)/100

    const taxa = (chargeDetail.amount?.fees?.value || 0)/100

    const valorLiquido = valorBruto - taxa

    // BAIXA PARCELA
    await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({

        status:'paga',
        valor_pago:valorBruto,
        data_pagamento:dataPagamento,
        pagbank_status:currentStatus,
        pagbank_charge_id:charge.id,
        webhook_processed_at:new Date().toISOString()

      })
      .eq('id',parcelaId)

    console.log(`[pagbank-webhook:${requestId}] baixa parcela ok`)

    let config:any=null

    try{

      const {data:configData} = await supabaseAdmin
        .from('configuracoes_pagbank')
        .select('*')
        .eq('proprietario_id',parcela.admin_id)
        .single()

      config = configData

    }
    catch(err){

      console.error(`[pagbank-webhook:${requestId}] erro config PagBank`,err)

    }

    // REGISTRO RECEBIMENTO
    if(config){

      try{

        await supabaseAdmin.from('admin_recebimentos').insert({

          parcela_id:parcelaId,
          admin_id:parcela.admin_id,
          cliente_id:parcela.admin_contas_receber?.cliente_id ?? null,
          valor_recebido:valorBruto,
          data_recebimento:dataPagamento,
          forma_pagamento:'PagBank',
          pagbank_taxa_valor:taxa,
          pagbank_valor_liquido:valorLiquido,
          conta_id:config.conta_id,
          id_conta_contabil:config.conta_sintetica_id,
          historico_id:config.historico_padrao_id,
          id_conta_resultado:config.id_conta_resultado

        })

      }
      catch(err){

        console.error(`[pagbank-webhook:${requestId}] erro recebimento`,err)

      }

    }

    // LANÇAMENTOS CONTÁBEIS
    if(config){

      try{

        const contaSinteticaId = config.conta_sintetica_id ?? config.conta_id

        const contaPatrimonialId =
          parcela.admin_contas_receber?.id_conta_patrimonial ?? null

        if(!contaSinteticaId || !contaPatrimonialId){

          console.warn(`[pagbank-webhook:${requestId}] contas contábeis não configuradas`)

        }
        else{

          const {data:saldoConta} = await supabaseAdmin
            .from('saldo_contas')
            .select('id')
            .eq('proprietario_id',parcela.admin_id)
            .eq('conta_contabil_id',contaSinteticaId)
            .maybeSingle()

          const contaBancariaId = saldoConta?.id ?? null

          const descricaoBase =
            `Recebimento PagBank ${parcela.admin_contas_receber?.descricao} P:${parcela.numero_parcela}`

          const idAtivo = crypto.randomUUID()

          const idPatrimonial = crypto.randomUUID()

          const lancamentos = [

            {
              id:idAtivo,
              proprietario_id:parcela.admin_id,
              documento:parcelaId,
              data_movimentacao:dataPagamento,
              descricao:`Recebimento líquido ${descricaoBase}`,
              valor:valorLiquido,
              tipo:'Entrada',
              conta_bancaria_id:contaBancariaId,
              conta_contabil_id:contaSinteticaId,
              origem:'recebimento_pagbank',
              historico_id:config.historico_padrao_id,
              conta_resultado_id:idPatrimonial,
              conciliado:true
            },

            {
              id:idPatrimonial,
              proprietario_id:parcela.admin_id,
              documento:parcelaId,
              data_movimentacao:dataPagamento,
              descricao:`Baixa CR bruto ${descricaoBase}`,
              valor:valorBruto,
              tipo:'Saida',
              conta_bancaria_id:null,
              conta_contabil_id:contaPatrimonialId,
              origem:'recebimento_pagbank',
              historico_id:config.historico_padrao_id,
              conta_resultado_id:idAtivo,
              conciliado:true
            }

          ]

          if(taxa > 0 && config.conta_despesa_taxa_id){

            lancamentos.push({

              id:crypto.randomUUID(),
              proprietario_id:parcela.admin_id,
              documento:parcelaId,
              data_movimentacao:dataPagamento,
              descricao:`Taxa PagBank ${descricaoBase}`,
              valor:taxa,
              tipo:'Entrada',
              conta_bancaria_id:null,
              conta_contabil_id:config.conta_despesa_taxa_id,
              origem:'taxa_pagbank',
              historico_id:config.historico_taxa_id,
              conta_resultado_id:idAtivo,
              conciliado:true

            })

          }

          await supabaseAdmin.from('lancamentos').insert(lancamentos)

          console.log(`[pagbank-webhook:${requestId}] lançamentos contábeis criados`)

        }

      }
      catch(err){

        console.error(`[pagbank-webhook:${requestId}] erro lançamentos`,err)

      }

    }

    return new Response(
      JSON.stringify({success:true}),
      {status:200,headers:{...corsHeaders,'Content-Type':'application/json'}}
    )

  }
  catch(err:any){

    console.error(`[pagbank-webhook:${requestId}] erro crítico`,err.message)

    return new Response(
      JSON.stringify({error:err.message}),
      {status:500,headers:{...corsHeaders,'Content-Type':'application/json'}}
    )

  }

})
