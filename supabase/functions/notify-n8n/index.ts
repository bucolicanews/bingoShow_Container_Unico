import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Lida com a requisição pre-flight do CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Pega os dados da notificação enviados pelo app
    const { event, data } = await req.json();
    if (!event || !data) {
      throw new Error("O evento e os dados são obrigatórios.");
    }

    // Cria um cliente Supabase com permissões de administrador para ler as configurações
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Pega o usuário que está enviando a notificação para incluir nos dados
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('[notify-n8n] Erro: Token de autorização não encontrado.');
      throw new Error("Token de autorização não encontrado.");
    }
    
    const userSupabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
    )
    const { data: userData, error: userError } = await userSupabaseClient.auth.getUser();
    if (userError || !userData.user) {
      console.error('[notify-n8n] Erro de autenticação do usuário:', userError?.message || 'Usuário não encontrado.');
      throw new Error("Usuário inválido ou token expirado.");
    }
    const user = userData.user;

    // Busca as configurações do n8n no banco de dados
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('configuracoes')
      .select('n8n_test_url, n8n_prod_url, n8n_env')
      .single();

    if (settingsError) {
      console.error('[notify-n8n] Erro ao buscar configurações:', settingsError.message);
      throw new Error(`Erro ao buscar configurações: ${settingsError.message}`);
    }

    // Decide qual URL usar com base no ambiente selecionado
    const webhookUrl = settings.n8n_env === 'production' 
      ? settings.n8n_prod_url 
      : settings.n8n_test_url;

    console.log(`[notify-n8n] Usando n8n_env: '${settings.n8n_env}'. URL de destino: ${webhookUrl}`);

    if (!webhookUrl) {
      console.warn(`[notify-n8n] URL do webhook para o ambiente '${settings.n8n_env}' não está configurada. Abortando.`);
      // Retorna sucesso para não quebrar o fluxo do app, mas não envia nada.
      return new Response(JSON.stringify({ success: true, message: "Webhook URL not configured." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Monta o payload final para enviar ao n8n
    const payload = {
      event,
      user: {
        id: user.id,
        email: user.email,
      },
      data,
      timestamp: new Date().toISOString(),
    };

    // Envia os dados para o n8n
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      console.error(`[notify-n8n] O webhook do n8n respondeu com o status: ${response.status}. Body: ${responseBody}`);
      throw new Error(`O webhook do n8n respondeu com o status: ${response.status}`);
    }
    
    console.log(`[notify-n8n] Evento '${event}' enviado com sucesso para o ambiente '${settings.n8n_env}'.`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[notify-n8n] Erro:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})