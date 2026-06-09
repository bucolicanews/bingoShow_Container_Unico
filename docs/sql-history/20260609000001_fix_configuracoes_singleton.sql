-- Fix: configuracoes deve ser singleton (uma linha).
-- O bug: update_game_settings criava linha nova por admin_id,
-- mas o SELECT do frontend lia a linha original → toggle não persistia.
-- O .single() nas edge functions explodia com 2+ linhas → 500.

-- Passo 1: Limpar linhas duplicadas, manter a mais antiga
DO $$
DECLARE
  v_keep_id uuid;
BEGIN
  SELECT id INTO v_keep_id
  FROM configuracoes
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  IF v_keep_id IS NOT NULL THEN
    DELETE FROM configuracoes WHERE id != v_keep_id;
  END IF;
END $$;

-- Passo 2: Corrigir update_game_settings para atualizar a linha singleton
CREATE OR REPLACE FUNCTION "public"."update_game_settings"("p_settings" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller_role TEXT;
  v_config_id   uuid;
BEGIN
  SELECT role INTO v_caller_role FROM perfis WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'dev') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF (p_settings ? 'intervalo_sorteio_auto_seg') AND (p_settings->>'intervalo_sorteio_auto_seg')::NUMERIC < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_interval_too_low');
  END IF;

  -- Pega o ID da linha singleton (a mais antiga)
  SELECT id INTO v_config_id FROM configuracoes ORDER BY created_at ASC NULLS LAST LIMIT 1;

  -- Cria se não existir nenhuma
  IF v_config_id IS NULL THEN
    INSERT INTO configuracoes (admin_id) VALUES (auth.uid()) RETURNING id INTO v_config_id;
  END IF;

  UPDATE configuracoes SET
    custo_nova_cartela             = COALESCE((p_settings->>'custo_nova_cartela')::NUMERIC,          custo_nova_cartela),
    custo_recarga_cartela          = COALESCE((p_settings->>'custo_recarga_cartela')::NUMERIC,       custo_recarga_cartela),
    usos_por_recarga               = COALESCE((p_settings->>'usos_por_recarga')::INTEGER,            usos_por_recarga),
    intervalo_sorteio_auto_seg     = COALESCE((p_settings->>'intervalo_sorteio_auto_seg')::NUMERIC,  intervalo_sorteio_auto_seg),
    valor_por_credito              = COALESCE((p_settings->>'valor_por_credito')::NUMERIC,           valor_por_credito),
    pix_key                        = COALESCE(p_settings->>'pix_key',                                pix_key),
    pix_name                       = COALESCE(p_settings->>'pix_name',                               pix_name),
    pix_city                       = COALESCE(p_settings->>'pix_city',                               pix_city),
    credit_request_text            = COALESCE(p_settings->>'credit_request_text',                   credit_request_text),
    n8n_test_url                   = COALESCE(p_settings->>'n8n_test_url',                           n8n_test_url),
    n8n_prod_url                   = COALESCE(p_settings->>'n8n_prod_url',                           n8n_prod_url),
    n8n_env                        = COALESCE(p_settings->>'n8n_env',                                n8n_env),
    auto_engine_enabled            = CASE WHEN p_settings ? 'auto_engine_enabled' THEN (p_settings->>'auto_engine_enabled')::BOOLEAN ELSE auto_engine_enabled END,
    auto_engine_interval_mins      = COALESCE((p_settings->>'auto_engine_interval_mins')::INTEGER,   auto_engine_interval_mins),
    auto_engine_matches_per_day    = COALESCE((p_settings->>'auto_engine_matches_per_day')::INTEGER, auto_engine_matches_per_day),
    auto_engine_game_type          = COALESCE(p_settings->>'auto_engine_game_type',                  auto_engine_game_type),
    auto_engine_card_price         = COALESCE((p_settings->>'auto_engine_card_price')::NUMERIC,      auto_engine_card_price),
    auto_engine_prize_type         = COALESCE(p_settings->>'auto_engine_prize_type',                 auto_engine_prize_type),
    auto_engine_prize_value        = COALESCE((p_settings->>'auto_engine_prize_value')::NUMERIC,     auto_engine_prize_value),
    auto_engine_start_hour         = COALESCE((p_settings->>'auto_engine_start_hour')::INTEGER,      auto_engine_start_hour),
    auto_engine_max_cards          = COALESCE((p_settings->>'auto_engine_max_cards')::INTEGER,       auto_engine_max_cards),
    desconto_vendedor_global       = COALESCE((p_settings->>'desconto_vendedor_global')::NUMERIC,    desconto_vendedor_global),
    comissao_vendedor_global       = COALESCE((p_settings->>'comissao_vendedor_global')::NUMERIC,    comissao_vendedor_global),
    cartelas_por_folha_bingo       = COALESCE((p_settings->>'cartelas_por_folha_bingo')::INTEGER,    cartelas_por_folha_bingo),
    stripe_enabled                 = CASE WHEN p_settings ? 'stripe_enabled' THEN (p_settings->>'stripe_enabled')::BOOLEAN ELSE stripe_enabled END,
    stripe_env                     = COALESCE(p_settings->>'stripe_env',                             stripe_env),
    stripe_secret_key              = CASE WHEN p_settings ? 'stripe_secret_key' THEN p_settings->>'stripe_secret_key' ELSE stripe_secret_key END,
    stripe_secret_key_test         = COALESCE(p_settings->>'stripe_secret_key_test',                 stripe_secret_key_test),
    stripe_webhook_secret          = CASE WHEN p_settings ? 'stripe_webhook_secret' THEN p_settings->>'stripe_webhook_secret' ELSE stripe_webhook_secret END,
    stripe_webhook_secret_test     = COALESCE(p_settings->>'stripe_webhook_secret_test',             stripe_webhook_secret_test),
    stripe_pass_fees_to_customer   = CASE WHEN p_settings ? 'stripe_pass_fees_to_customer' THEN (p_settings->>'stripe_pass_fees_to_customer')::BOOLEAN ELSE stripe_pass_fees_to_customer END,
    stripe_fee_percentage          = COALESCE((p_settings->>'stripe_fee_percentage')::NUMERIC,       stripe_fee_percentage),
    stripe_fee_fixed               = COALESCE((p_settings->>'stripe_fee_fixed')::NUMERIC,            stripe_fee_fixed),
    pagbank_enabled                = CASE WHEN p_settings ? 'pagbank_enabled' THEN (p_settings->>'pagbank_enabled')::BOOLEAN ELSE pagbank_enabled END,
    pagbank_env                    = COALESCE(p_settings->>'pagbank_env',                            pagbank_env),
    pagbank_token_sandbox          = COALESCE(p_settings->>'pagbank_token_sandbox',                  pagbank_token_sandbox),
    pagbank_token_producao         = COALESCE(p_settings->>'pagbank_token_producao',                 pagbank_token_producao),
    pagbank_pass_fees_to_customer  = CASE WHEN p_settings ? 'pagbank_pass_fees_to_customer' THEN (p_settings->>'pagbank_pass_fees_to_customer')::BOOLEAN ELSE pagbank_pass_fees_to_customer END,
    pagbank_pix_fee_fixed          = COALESCE((p_settings->>'pagbank_pix_fee_fixed')::NUMERIC,       pagbank_pix_fee_fixed),
    pagbank_pix_fee_percentage     = COALESCE((p_settings->>'pagbank_pix_fee_percentage')::NUMERIC,  pagbank_pix_fee_percentage),
    pagbank_card_fee_fixed         = COALESCE((p_settings->>'pagbank_card_fee_fixed')::NUMERIC,      pagbank_card_fee_fixed),
    pagbank_card_fee_percentage    = COALESCE((p_settings->>'pagbank_card_fee_percentage')::NUMERIC, pagbank_card_fee_percentage),
    live_external_enabled          = CASE WHEN p_settings ? 'live_external_enabled' THEN (p_settings->>'live_external_enabled')::BOOLEAN ELSE live_external_enabled END,
    live_external_provider         = COALESCE(p_settings->>'live_external_provider',                 live_external_provider),
    live_external_rtmp_url         = COALESCE(p_settings->>'live_external_rtmp_url',                 live_external_rtmp_url),
    live_external_stream_key       = COALESCE(p_settings->>'live_external_stream_key',               live_external_stream_key),
    live_external_youtube_url      = COALESCE(p_settings->>'live_external_youtube_url',              live_external_youtube_url),
    live_external_facebook_url     = COALESCE(p_settings->>'live_external_facebook_url',             live_external_facebook_url)
  WHERE id = v_config_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
