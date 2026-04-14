import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Autentica o usuário
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('[test-n8n] Erro: Token de autorização não encontrado.');
      throw new Error("Token de autorização não encontrado.");
    }
    
    const userSupabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await userSupabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('[test-n8n] Erro de autenticação do usuário:', userError?.message || 'Usuário não encontrado.');
      throw new Error("Usuário inválido ou token expirado.");
    }

    // Verifica se o usuário é um administrador
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('perfis')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin') {
      console.error('[test-n8n] Erro de autorização: Usuário não é um administrador.');
      return new Response(JSON.stringify({ error: 'Apenas administradores podem testar a conexão.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    // Busca as configurações do n8n no banco de dados
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('configuracoes')
      .select('n8n_test_url, n8n_prod_url, n8n_env')
      .single();

    if (settingsError) {
      console.error('[test-n8n] Erro ao buscar configurações:', settingsError.message);
      throw new Error(`Erro ao buscar configurações: ${settingsError.message}`);
    }

    // Decide qual URL usar com base no ambiente selecionado
    const webhookUrl = settings.n8n_env === 'production' 
      ? settings.n8n_prod_url 
      : settings.n8n_test_url;

    console.log(`[test-n8n] Testando ambiente: '${settings.n8n_env}'. URL de destino: ${webhookUrl}`);

    if (!webhookUrl) {
      throw new Error(`A URL do webhook para o ambiente '${settings.n8n_env}' não está configurada.`);
    }

    const payload = {
      event: 'CONNECTION_TEST',
      user: {
        id: user.id,
        email: user.email,
      },
      data: {
        message: 'Esta é uma mensagem de teste do aplicativo Bingo!',
        status: 'success',
      },
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      console.error(`[test-n8n] O webhook do n8n respondeu com o status: ${response.status}. Body: ${responseBody}`);
      throw new Error(`O webhook do n8n respondeu com o status: ${response.status}`);
    }
    
    console.log(`[test-n8n] Evento de teste enviado com sucesso.`);

    return new Response(JSON.stringify({ success: true, message: `Notificação de teste enviada para o ambiente '${settings.n8n_env}' com sucesso!` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[test-n8n] Erro:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})