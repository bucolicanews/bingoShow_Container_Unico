-- 1. Atualizar o gatilho de criação de usuário para vincular ao Admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_primeiro_admin UUID;
BEGIN
  -- Pega um admin padrão para vincular o novo usuário (Para não quebrar o seu bingo atual)
  SELECT id INTO v_primeiro_admin FROM public.admins LIMIT 1;

  INSERT INTO public.perfis (id, full_name, avatar_url, role, credits, bloqueado, admins_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    'user',
    0,
    false,
    v_primeiro_admin
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Atualizar a função que guarda o lucro do Admin
CREATE OR REPLACE FUNCTION public.increment_admin_profit(amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Descobre quem é o dono do bingo (Admin)
  IF public.is_admin() THEN
    v_admin_id := auth.uid();
  ELSE
    -- Se for um jogador/vendedor pagando, pega o dono do bingo a partir do perfil dele
    SELECT admins_id INTO v_admin_id FROM public.perfis WHERE id = auth.uid();
  END IF;

  IF v_admin_id IS NOT NULL THEN
    UPDATE public.configuracoes SET admin_profit = admin_profit + amount WHERE admin_id = v_admin_id;
  END IF;
END;
$$;

-- 3. Atualizar a função de saque de lucro
CREATE OR REPLACE FUNCTION public.withdraw_admin_profit(amount_to_withdraw numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  IF public.is_admin() THEN
    UPDATE public.configuracoes
    SET admin_profit = admin_profit - amount_to_withdraw
    WHERE admin_id = auth.uid() AND admin_profit >= amount_to_withdraw;
  END IF;
END;
$$;

-- 4. Atualizar a função que salva as configurações do painel
CREATE OR REPLACE FUNCTION public.update_game_settings(p_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Garante que este admin tenha uma linha de configuração própria
  IF NOT EXISTS (SELECT 1 FROM configuracoes WHERE admin_id = auth.uid()) THEN
    INSERT INTO configuracoes (admin_id, singleton) VALUES (auth.uid(), false);
  END IF;

  UPDATE configuracoes SET
    custo_nova_cartela         = COALESCE((p_settings->>'custo_nova_cartela')::NUMERIC, custo_nova_cartela),
    custo_recarga_cartela      = COALESCE((p_settings->>'custo_recarga_cartela')::NUMERIC, custo_recarga_cartela),
    usos_por_recarga           = COALESCE((p_settings->>'usos_por_recarga')::INTEGER, usos_por_recarga),
    intervalo_sorteio_auto_seg = COALESCE((p_settings->>'intervalo_sorteio_auto_seg')::NUMERIC, intervalo_sorteio_auto_seg),
    valor_por_credito          = COALESCE((p_settings->>'valor_por_credito')::NUMERIC, valor_por_credito),
    pix_key                    = COALESCE(p_settings->>'pix_key', pix_key),
    pix_name                   = COALESCE(p_settings->>'pix_name', pix_name),
    pix_city                   = COALESCE(p_settings->>'pix_city', pix_city),
    credit_request_text        = COALESCE(p_settings->>'credit_request_text', credit_request_text),
    n8n_test_url               = COALESCE(p_settings->>'n8n_test_url', n8n_test_url),
    n8n_prod_url               = COALESCE(p_settings->>'n8n_prod_url', n8n_prod_url),
    n8n_env                    = COALESCE(p_settings->>'n8n_env', n8n_env),
    auto_engine_enabled        = CASE WHEN p_settings ? 'auto_engine_enabled' THEN (p_settings->>'auto_engine_enabled')::BOOLEAN ELSE auto_engine_enabled END,
    stripe_enabled             = CASE WHEN p_settings ? 'stripe_enabled' THEN (p_settings->>'stripe_enabled')::BOOLEAN ELSE stripe_enabled END,
    stripe_pass_fees_to_customer = CASE WHEN p_settings ? 'stripe_pass_fees_to_customer' THEN (p_settings->>'stripe_pass_fees_to_customer')::BOOLEAN ELSE stripe_pass_fees_to_customer END,
    auto_engine_interval_mins  = COALESCE((p_settings->>'auto_engine_interval_mins')::INTEGER, auto_engine_interval_mins),
    auto_engine_matches_per_day = COALESCE((p_settings->>'auto_engine_matches_per_day')::INTEGER, auto_engine_matches_per_day),
    auto_engine_game_type      = COALESCE(p_settings->>'auto_engine_game_type', auto_engine_game_type),
    auto_engine_card_price     = COALESCE((p_settings->>'auto_engine_card_price')::NUMERIC, auto_engine_card_price),
    auto_engine_prize_type     = COALESCE(p_settings->>'auto_engine_prize_type', auto_engine_prize_type),
    auto_engine_prize_value    = COALESCE((p_settings->>'auto_engine_prize_value')::NUMERIC, auto_engine_prize_value),
    auto_engine_start_hour     = COALESCE((p_settings->>'auto_engine_start_hour')::INTEGER, auto_engine_start_hour),
    desconto_vendedor_global   = COALESCE((p_settings->>'desconto_vendedor_global')::NUMERIC, desconto_vendedor_global),
    comissao_vendedor_global   = COALESCE((p_settings->>'comissao_vendedor_global')::NUMERIC, comissao_vendedor_global),
    cartelas_por_folha_bingo   = COALESCE((p_settings->>'cartelas_por_folha_bingo')::INTEGER, cartelas_por_folha_bingo),
    stripe_secret_key          = CASE WHEN p_settings ? 'stripe_secret_key' THEN p_settings->>'stripe_secret_key' ELSE stripe_secret_key END,
    stripe_webhook_secret      = CASE WHEN p_settings ? 'stripe_webhook_secret' THEN p_settings->>'stripe_webhook_secret' ELSE stripe_webhook_secret END,
    stripe_fee_percentage      = COALESCE((p_settings->>'stripe_fee_percentage')::NUMERIC, stripe_fee_percentage),
    stripe_fee_fixed           = COALESCE((p_settings->>'stripe_fee_fixed')::NUMERIC, stripe_fee_fixed),
    live_external_enabled      = CASE WHEN p_settings ? 'live_external_enabled' THEN (p_settings->>'live_external_enabled')::BOOLEAN ELSE live_external_enabled END,
    live_external_provider     = COALESCE(p_settings->>'live_external_provider', live_external_provider),
    live_external_rtmp_url     = COALESCE(p_settings->>'live_external_rtmp_url', live_external_rtmp_url),
    live_external_stream_key   = COALESCE(p_settings->>'live_external_stream_key', live_external_stream_key),
    live_external_youtube_url  = COALESCE(p_settings->>'live_external_youtube_url', live_external_youtube_url),
    live_external_facebook_url = COALESCE(p_settings->>'live_external_facebook_url', live_external_facebook_url)
  WHERE admin_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';