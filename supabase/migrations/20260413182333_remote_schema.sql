


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."credit_request_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."credit_request_status" OWNER TO "postgres";


CREATE TYPE "public"."match_status" AS ENUM (
    'waiting',
    'open',
    'in_progress',
    'finished'
);


ALTER TYPE "public"."match_status" OWNER TO "postgres";


CREATE TYPE "public"."prize_type" AS ENUM (
    'product',
    'fixed',
    'percentage'
);


ALTER TYPE "public"."prize_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'user',
    'dev',
    'vendedor'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_adjust_credits"("p_player_id" "uuid", "p_delta" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM perfis WHERE id = auth.uid();
  IF v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE perfis
  SET credits = credits + p_delta
  WHERE id = p_player_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."admin_adjust_credits"("p_player_id" "uuid", "p_delta" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_adjust_fake_credits"("p_player_id" "uuid", "p_delta" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM perfis WHERE id = auth.uid();
  IF v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE perfis
  SET fake_credits = COALESCE(fake_credits, 0) + p_delta
  WHERE id = p_player_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."admin_adjust_fake_credits"("p_player_id" "uuid", "p_delta" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."append_called_number"("p_match_id" "uuid", "p_num" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_status text;
  v_called int[];
  v_already boolean;
begin
  -- Trava a linha da partida para consistência.
  select status, coalesce(called_numbers, '{}'::int[])
    into v_status, v_called
  from public.partidas
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Partida não encontrada';
  end if;

  if v_status = 'finished' then
    return jsonb_build_object(
      'status', v_status,
      'already_called', true,
      'called_numbers', v_called
    );
  end if;

  v_already := (p_num = any(v_called));

  if not v_already then
    update public.partidas
      set called_numbers = array_append(v_called, p_num)
    where id = p_match_id
    returning called_numbers into v_called;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'already_called', v_already,
    'called_numbers', v_called
  );
end;
$$;


ALTER FUNCTION "public"."append_called_number"("p_match_id" "uuid", "p_num" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aprovar_pagamento_cliente_bingo"("p_venda_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_venda record;
  v_vendedor record;
  v_cfg record;
  v_comissao_perc numeric;
  v_comissao_valor numeric := 0;
  v_preco_total_cartela numeric;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('success', false, 'error', 'unauthorized'); END IF;

  SELECT * INTO v_venda FROM public.vendas_bingo_fisico WHERE id = p_venda_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;

  IF v_venda.status != 'em_analise' THEN
    RETURN jsonb_build_object('success', false, 'error', 'venda_nao_esta_em_analise');
  END IF;

  SELECT * INTO v_cfg FROM public.configuracoes LIMIT 1;

  IF v_venda.desconto_aplicado < 100 AND v_venda.desconto_aplicado > 0 THEN
    v_preco_total_cartela := v_venda.valor_pago / (1 - (v_venda.desconto_aplicado / 100.0));
  ELSE
    v_preco_total_cartela := v_venda.valor_pago;
  END IF;

  UPDATE public.vendas_bingo_fisico SET status = 'pago' WHERE id = p_venda_id;
  UPDATE public.partidas SET pot = pot + v_preco_total_cartela WHERE id = v_venda.match_id;

  -- Tenta achar o vendedor
  SELECT * INTO v_vendedor FROM public.vendedores_rifa WHERE id = v_venda.vendedor_id;
  
  -- CORREÇÃO CRÍTICA AQUI:
  IF FOUND AND v_vendedor.id IS NOT NULL THEN
      v_comissao_perc := v_vendedor.comissao_percentual;
      IF v_comissao_perc IS NULL OR v_comissao_perc = 0 THEN
        v_comissao_perc := COALESCE(v_cfg.comissao_vendedor_global, 0);
      END IF;
      
      IF v_comissao_perc > 0 THEN
        v_comissao_valor := v_preco_total_cartela * (v_comissao_perc / 100.0);
        
        -- Credita a comissão para o vendedor!
        UPDATE public.perfis SET credits = credits + v_comissao_valor WHERE id = v_vendedor.user_id;
      END IF;
  END IF;

  -- O admin ganha a diferença exata
  PERFORM public.increment_admin_profit(v_preco_total_cartela - v_comissao_valor);

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."aprovar_pagamento_cliente_bingo"("p_venda_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aprovar_pagamento_cliente_rifa"("p_venda_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_compra record;
  v_vendedor record;
  v_cfg record;
  v_comissao_perc numeric;
  v_comissao_valor numeric := 0;
  v_preco_total_compra numeric;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('success', false, 'error', 'unauthorized'); END IF;

  SELECT * INTO v_compra FROM public.compras_rifa WHERE id = p_venda_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;

  IF v_compra.status != 'em_analise' THEN
    RETURN jsonb_build_object('success', false, 'error', 'compra_nao_esta_em_analise');
  END IF;

  SELECT * INTO v_cfg FROM public.configuracoes LIMIT 1;

  IF v_compra.desconto_aplicado < 100 AND v_compra.desconto_aplicado > 0 THEN
    v_preco_total_compra := v_compra.valor_total / (1 - (v_compra.desconto_aplicado / 100.0));
  ELSE
    v_preco_total_compra := v_compra.valor_total;
  END IF;

  UPDATE public.compras_rifa SET status = 'pago' WHERE id = p_venda_id;

  -- Tenta achar o vendedor associado
  SELECT * INTO v_vendedor FROM public.vendedores_rifa WHERE id = COALESCE(v_compra.vendedor_id, v_compra.ref_vendedor_id);
  
  -- CORREÇÃO CRÍTICA AQUI: O PostgreSQL pula o IF IS NOT NULL se algum dado (como telefone) for nulo. Usamos FOUND.
  IF FOUND AND v_vendedor.id IS NOT NULL THEN
      v_comissao_perc := v_vendedor.comissao_percentual;
      IF v_comissao_perc IS NULL OR v_comissao_perc = 0 THEN
        v_comissao_perc := COALESCE(v_cfg.comissao_vendedor_global, 0);
      END IF;

      IF v_comissao_perc > 0 THEN
        v_comissao_valor := v_preco_total_compra * (v_comissao_perc / 100.0);
        
        -- Credita a comissão exata para o vendedor!
        UPDATE public.perfis SET credits = credits + v_comissao_valor WHERE id = v_vendedor.user_id;
      END IF;
  END IF;

  -- O admin ganha a diferença exata (Ex: 1.00 - 0.10 = 0.90)
  PERFORM public.increment_admin_profit(v_preco_total_compra - v_comissao_valor);

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."aprovar_pagamento_cliente_rifa"("p_venda_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aprovar_pedido_plano"("p_pedido_id" "uuid", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'dev') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE pedidos_planos
  SET status = 'ativo', admin_id = p_admin_id
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."aprovar_pedido_plano"("p_pedido_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric DEFAULT 0, "p_desconto" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller_role TEXT;
  v_solicitacao solicitacoes_vendedor%ROWTYPE;
  v_vendedor_id UUID;
  v_codigo_ref TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM perfis WHERE id = auth.uid();
  IF v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_solicitacao FROM solicitacoes_vendedor WHERE id = p_solicitacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  UPDATE perfis SET role = 'vendedor' WHERE id = v_solicitacao.user_id;

  v_codigo_ref := upper(substr(md5(v_solicitacao.user_id::text || random()::text), 1, 8));

  INSERT INTO vendedores_rifa (user_id, nome, documento, telefone, comissao_percentual, percentual_desconto, codigo_ref, ativo)
  VALUES (v_solicitacao.user_id, v_solicitacao.nome, v_solicitacao.documento, v_solicitacao.telefone, p_comissao, p_desconto, v_codigo_ref, true)
  ON CONFLICT (user_id) DO UPDATE
    SET comissao_percentual = p_comissao, percentual_desconto = p_desconto, ativo = true, codigo_ref = COALESCE(vendedores_rifa.codigo_ref, v_codigo_ref)
  RETURNING id INTO v_vendedor_id;

  UPDATE solicitacoes_vendedor
  SET status = 'aprovado', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = p_solicitacao_id;

  RETURN jsonb_build_object('success', true, 'vendedor_id', v_vendedor_id);
END;
$$;


ALTER FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric, "p_desconto" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric DEFAULT 0, "p_desconto" numeric DEFAULT 0, "p_mensagem_admin" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller_role TEXT;
  v_solicitacao solicitacoes_vendedor%ROWTYPE;
  v_vendedor_id UUID;
  v_codigo_ref TEXT;
  v_user_current_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM perfis WHERE id = auth.uid();
  IF v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_solicitacao FROM solicitacoes_vendedor WHERE id = p_solicitacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  SELECT role INTO v_user_current_role FROM perfis WHERE id = v_solicitacao.user_id;
  IF v_user_current_role != 'admin' THEN
    UPDATE perfis SET role = 'vendedor' WHERE id = v_solicitacao.user_id;
  END IF;

  v_codigo_ref := upper(substr(md5(v_solicitacao.user_id::text || random()::text), 1, 8));

  INSERT INTO vendedores_rifa (user_id, nome, documento, telefone, comissao_percentual, percentual_desconto, codigo_ref, ativo)
  VALUES (v_solicitacao.user_id, v_solicitacao.nome, v_solicitacao.documento, v_solicitacao.telefone, p_comissao, p_desconto, v_codigo_ref, true)
  ON CONFLICT (user_id) DO UPDATE
    SET comissao_percentual = p_comissao, percentual_desconto = p_desconto, ativo = true, codigo_ref = COALESCE(vendedores_rifa.codigo_ref, v_codigo_ref)
  RETURNING id INTO v_vendedor_id;

  UPDATE solicitacoes_vendedor
  SET status = 'aprovado',
      mensagem_admin = p_mensagem_admin,
      resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = p_solicitacao_id;

  RETURN jsonb_build_object('success', true, 'vendedor_id', v_vendedor_id);
END;
$$;


ALTER FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric, "p_desconto" numeric, "p_mensagem_admin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_modulos_admin"("p_admin_id" "uuid", "p_modulo_bingo" boolean, "p_modulo_rifa" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'dev') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  INSERT INTO admin_modulos (admin_id, modulo_bingo, modulo_rifa)
  VALUES (p_admin_id, p_modulo_bingo, p_modulo_rifa)
  ON CONFLICT (admin_id) DO UPDATE
    SET modulo_bingo = EXCLUDED.modulo_bingo, modulo_rifa = EXCLUDED.modulo_rifa;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."atualizar_modulos_admin"("p_admin_id" "uuid", "p_modulo_bingo" boolean, "p_modulo_rifa" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buy_card_uses"("p_player_card_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_card         cartelas_jogador%ROWTYPE;
  v_settings     configuracoes%ROWTYPE;
  v_profile      perfis%ROWTYPE;
  v_cost         NUMERIC;
  v_is_fake      BOOLEAN;
BEGIN
  SELECT * INTO v_card
  FROM cartelas_jogador
  WHERE id = p_player_card_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'card_not_found');
  END IF;

  IF v_card.player_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_settings FROM configuracoes LIMIT 1;
  v_cost := v_settings.custo_recarga_cartela;

  v_is_fake := (v_card.credit_type = 'fake');

  SELECT * INTO v_profile
  FROM perfis
  WHERE id = v_card.player_id
  FOR UPDATE;

  IF v_is_fake THEN
    IF (COALESCE(v_profile.fake_credits, 0) < v_cost) THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_fake_credits');
    END IF;
    UPDATE perfis
    SET fake_credits = fake_credits - v_cost
    WHERE id = v_card.player_id;
  ELSE
    IF v_cost > 0 AND (v_profile.credits < v_cost) THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
    END IF;
    IF v_cost > 0 THEN
      UPDATE perfis
      SET credits = credits - v_cost
      WHERE id = v_card.player_id;
    END IF;
  END IF;

  UPDATE cartelas_jogador
  SET uses_left = uses_left + v_settings.usos_por_recarga
  WHERE id = p_player_card_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."buy_card_uses"("p_player_card_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buy_player_card"("p_name" "text", "p_numbers" "jsonb", "p_credit_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_cost numeric; -- Alterado de int para numeric
  v_uses int;
  v_balance numeric; -- Alterado de int para numeric
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  
  -- 1. Pega o custo e os usos da configuração
  SELECT custo_nova_cartela, usos_por_recarga INTO v_cost, v_uses FROM public.configuracoes LIMIT 1;
  IF v_cost IS NULL THEN
    v_cost := 10.0; -- Fallback seguro
  END IF;
  IF v_uses IS NULL OR v_uses < 1 THEN
    v_uses := 1; -- Fallback seguro
  END IF;

  -- 2. Verifica saldo e realiza o débito
  IF p_credit_type = 'real' THEN
    -- Verifica saldo real
    SELECT credits INTO v_balance FROM public.perfis WHERE id = v_user_id;
    IF v_balance IS NULL OR v_balance < v_cost THEN 
      RAISE EXCEPTION 'Saldo insuficiente de créditos reais.'; 
    END IF;
    -- Debita
    UPDATE public.perfis SET credits = credits - v_cost WHERE id = v_user_id;
    
  ELSIF p_credit_type = 'fake' THEN
    -- Verifica saldo fake
    SELECT fake_credits INTO v_balance FROM public.perfis WHERE id = v_user_id;
    IF v_balance IS NULL OR v_balance < v_cost THEN 
      RAISE EXCEPTION 'Saldo de brincar insuficiente.'; 
    END IF;
    -- Debita
    UPDATE public.perfis SET fake_credits = fake_credits - v_cost WHERE id = v_user_id;
    
  ELSE
    RAISE EXCEPTION 'Tipo de crédito inválido: %', p_credit_type;
  END IF;

  -- 3. Insere a cartela com os usos configurados
  INSERT INTO public.cartelas_jogador (player_id, name, numbers, credit_type, uses_left)
  VALUES (v_user_id, p_name, p_numbers, p_credit_type, v_uses)
  RETURNING to_jsonb(cartelas_jogador.*) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."buy_player_card"("p_name" "text", "p_numbers" "jsonb", "p_credit_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancelar_reserva_vendedor"("p_numero_rifa_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_vendedor_id UUID;
  v_numero numeros_rifa%ROWTYPE;
  v_preco_unit NUMERIC;
  v_compra compras_rifa%ROWTYPE;
BEGIN
  SELECT id INTO v_vendedor_id FROM vendedores_rifa WHERE user_id = v_user_id AND ativo = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_a_vendor'); END IF;

  SELECT * INTO v_numero FROM numeros_rifa WHERE id = p_numero_rifa_id AND vendedor_id = v_vendedor_id AND status = 'reservado';
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'numero_not_found'); END IF;

  SELECT * INTO v_compra FROM compras_rifa WHERE vendedor_id = v_vendedor_id AND rifa_id = v_numero.rifa_id AND v_numero.numero = ANY(numeros) ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    v_preco_unit := v_compra.valor_total / array_length(v_compra.numeros, 1);
  ELSE
    v_preco_unit := 0;
  END IF;

  UPDATE numeros_rifa SET status = 'disponivel', vendedor_id = NULL WHERE id = p_numero_rifa_id;

  -- SÓ ESTORNA SE A COMPRA FOI "PAGA"
  IF v_preco_unit > 0 AND v_compra.status = 'pago' THEN
    UPDATE perfis SET credits = credits + v_preco_unit WHERE id = v_user_id;
  END IF;

  DELETE FROM cartelas_rifa WHERE numero_rifa_id = p_numero_rifa_id;

  UPDATE compras_rifa SET numeros = array_remove(numeros, v_numero.numero), valor_total = GREATEST(0, valor_total - v_preco_unit) WHERE id = v_compra.id;
  DELETE FROM compras_rifa WHERE id = v_compra.id AND array_length(numeros, 1) = 0;

  RETURN jsonb_build_object('success', true, 'creditos_estornados', CASE WHEN v_compra.status = 'pago' THEN v_preco_unit ELSE 0 END);
END;
$$;


ALTER FUNCTION "public"."cancelar_reserva_vendedor"("p_numero_rifa_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_match partidas%ROWTYPE;
  v_vendedor vendedores_rifa%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_qtd INT;
  v_total NUMERIC;
  v_desconto NUMERIC;
  v_folha JSONB;
BEGIN
  -- Verify vendor
  SELECT * INTO v_vendedor FROM vendedores_rifa WHERE id = p_vendedor_id AND user_id = v_user_id AND ativo = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_a_vendor'); END IF;

  -- Verify match
  SELECT * INTO v_match FROM partidas WHERE id = p_match_id AND status = 'open' AND is_auto_calling = false FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'match_unavailable'); END IF;

  v_qtd := jsonb_array_length(p_folhas);
  v_desconto := COALESCE(v_vendedor.percentual_desconto, 0);
  
  -- Preço total considerando o desconto do vendedor
  v_total := (v_qtd * v_match.card_price) * (1 - v_desconto / 100.0);

  -- Check credits
  IF (SELECT credits FROM perfis WHERE id = v_user_id) < v_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  -- Deduct credits
  UPDATE perfis SET credits = credits - v_total WHERE id = v_user_id;
  
  -- Add to match pot
  UPDATE partidas SET pot = pot + v_total WHERE id = p_match_id;

  -- Insert sheets
  FOR v_folha IN SELECT * FROM jsonb_array_elements(p_folhas) LOOP
    INSERT INTO vendas_bingo_fisico (match_id, vendedor_id, codigo_validacao, grids, valor_pago, desconto_aplicado)
    VALUES (
      p_match_id, 
      p_vendedor_id, 
      v_folha->>'codigo', 
      v_folha->'grids', 
      v_match.card_price * (1 - v_desconto / 100.0), 
      v_desconto
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'total', v_total);
END;
$$;


ALTER FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb", "p_pagar_depois" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_match partidas%ROWTYPE;
  v_vendedor vendedores_rifa%ROWTYPE;
  v_cfg configuracoes%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_qtd INT;
  v_total NUMERIC;
  v_desconto NUMERIC;
  v_folha JSONB;
BEGIN
  SELECT * INTO v_vendedor FROM vendedores_rifa WHERE id = p_vendedor_id AND user_id = v_user_id AND ativo = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_a_vendor'); END IF;

  SELECT * INTO v_match FROM partidas WHERE id = p_match_id AND status = 'open' AND is_auto_calling = false FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'match_unavailable'); END IF;

  SELECT * INTO v_cfg FROM configuracoes LIMIT 1;
  v_qtd := jsonb_array_length(p_folhas);

  -- Pega desconto do vendedor. Se for zero, pega o global.
  v_desconto := COALESCE(v_vendedor.percentual_desconto, 0);
  IF v_desconto = 0 THEN
    v_desconto := COALESCE(v_cfg.desconto_vendedor_global, 0);
  END IF;

  v_total := (v_qtd * v_match.card_price) * (1 - v_desconto / 100.0);

  IF NOT p_pagar_depois THEN
    IF (SELECT credits FROM perfis WHERE id = v_user_id) < v_total THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
    END IF;
    UPDATE perfis SET credits = credits - v_total WHERE id = v_user_id;
    UPDATE partidas SET pot = pot + v_total WHERE id = p_match_id; 
  END IF;

  FOR v_folha IN SELECT * FROM jsonb_array_elements(p_folhas) LOOP
    INSERT INTO vendas_bingo_fisico (match_id, vendedor_id, codigo_validacao, grids, valor_pago, desconto_aplicado, status)
    VALUES (
      p_match_id, p_vendedor_id, v_folha->>'codigo', v_folha->'grids', 
      v_match.card_price * (1 - v_desconto / 100.0), v_desconto,
      CASE WHEN p_pagar_depois THEN 'pendente' ELSE 'pago' END
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'total', v_total);
END;
$$;


ALTER FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb", "p_pagar_depois" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comprar_numeros_rifa"("p_rifa_id" "uuid", "p_numeros" integer[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_rifa    rifas%ROWTYPE;
  v_total   NUMERIC;
  v_compra_id UUID;
  v_num     INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_rifa FROM rifas WHERE id = p_rifa_id AND status = 'ativa' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'rifa_not_found');
  END IF;

  v_total := array_length(p_numeros, 1) * v_rifa.custo_por_numero;

  IF (SELECT credits FROM perfis WHERE id = v_user_id) < v_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  FOR v_num IN SELECT unnest(p_numeros) LOOP
    UPDATE numeros_rifa
    SET status = 'vendido', comprador_id = v_user_id
    WHERE rifa_id = p_rifa_id AND numero = v_num AND status = 'disponivel';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'numero_indisponivel:%', v_num;
    END IF;
  END LOOP;

  UPDATE perfis SET credits = credits - v_total WHERE id = v_user_id;

  INSERT INTO compras_rifa (rifa_id, comprador_id, numeros, valor_total, tipo_pagamento)
  VALUES (p_rifa_id, v_user_id, p_numeros, v_total, 'creditos')
  RETURNING id INTO v_compra_id;

  INSERT INTO cartelas_rifa (numero_rifa_id, compra_id)
  SELECT nr.id, v_compra_id
  FROM numeros_rifa nr
  WHERE nr.rifa_id = p_rifa_id AND nr.numero = ANY(p_numeros);

  RETURN jsonb_build_object('success', true, 'compra_id', v_compra_id, 'total', v_total);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."comprar_numeros_rifa"("p_rifa_id" "uuid", "p_numeros" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comprar_numeros_via_ref"("p_rifa_id" "uuid", "p_numeros" integer[], "p_ref_codigo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_rifa rifas%ROWTYPE;
  v_vendedor_id UUID;
  v_comissao NUMERIC;
  v_total NUMERIC;
  v_comissao_valor NUMERIC;
  v_compra_id UUID;
  v_num INT;
  v_cfg configuracoes%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_rifa FROM rifas WHERE id = p_rifa_id AND status = 'ativa' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'rifa_not_found');
  END IF;

  SELECT id, comissao_percentual INTO v_vendedor_id, v_comissao
  FROM vendedores_rifa WHERE codigo_ref = p_ref_codigo AND ativo = true;

  SELECT * INTO v_cfg FROM configuracoes LIMIT 1;
  IF v_comissao IS NULL OR v_comissao = 0 THEN
    v_comissao := COALESCE(v_cfg.comissao_vendedor_global, 0);
  END IF;

  v_total := array_length(p_numeros, 1) * v_rifa.custo_por_numero;

  IF (SELECT credits FROM perfis WHERE id = v_user_id) < v_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  FOR v_num IN SELECT unnest(p_numeros) LOOP
    UPDATE numeros_rifa
    SET status = 'vendido', comprador_id = v_user_id,
        vendedor_id = v_vendedor_id
    WHERE rifa_id = p_rifa_id AND numero = v_num AND status = 'disponivel';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'numero_indisponivel:%', v_num;
    END IF;
  END LOOP;

  UPDATE perfis SET credits = credits - v_total WHERE id = v_user_id;

  INSERT INTO compras_rifa (rifa_id, comprador_id, numeros, valor_total, tipo_pagamento, ref_vendedor_id)
  VALUES (p_rifa_id, v_user_id, p_numeros, v_total, 'creditos', v_vendedor_id)
  RETURNING id INTO v_compra_id;

  IF v_vendedor_id IS NOT NULL AND v_comissao > 0 THEN
    v_comissao_valor := v_total * (v_comissao / 100.0);
    UPDATE perfis SET credits = credits + v_comissao_valor
    WHERE id = (SELECT user_id FROM vendedores_rifa WHERE id = v_vendedor_id);
    
    PERFORM increment_admin_profit(-v_comissao_valor);
  END IF;

  INSERT INTO cartelas_rifa (numero_rifa_id, compra_id)
  SELECT nr.id, v_compra_id FROM numeros_rifa nr
  WHERE nr.rifa_id = p_rifa_id AND nr.numero = ANY(p_numeros);

  RETURN jsonb_build_object('success', true, 'compra_id', v_compra_id, 'total', v_total);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."comprar_numeros_via_ref"("p_rifa_id" "uuid", "p_numeros" integer[], "p_ref_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirmar_ganho_rifa"("p_rifa_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_updated INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.rifas
  SET ganhador_confirmou = TRUE
  WHERE id = p_rifa_id AND ganhador_id = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  IF v_updated > 0 THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$;


ALTER FUNCTION "public"."confirmar_ganho_rifa"("p_rifa_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."correct_called_number"("p_match_id" "uuid", "p_old_number" integer, "p_new_number" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_admin_id uuid;
  v_match public.partidas%ROWTYPE;
  v_new_called_numbers integer[];
  v_position integer := 0;
  v_updated_cards integer := 0;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Verifica se é admin
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_only');
  END IF;

  -- Busca a partida
  SELECT *
    INTO v_match
  FROM public.partidas
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- Correção permitida apenas em chamada manual (não automática)
  IF COALESCE(v_match.is_auto_calling, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'auto_calling_not_allowed');
  END IF;

  -- Valida números
  IF p_new_number < 1 OR p_new_number > 75 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_new_number');
  END IF;

  -- Verifica se o número novo já foi chamado
  IF p_new_number = ANY(v_match.called_numbers) AND p_new_number <> p_old_number THEN
    RETURN jsonb_build_object('success', false, 'error', 'new_number_already_called');
  END IF;

  -- Encontra a posição do número antigo
  SELECT array_position(v_match.called_numbers, p_old_number) INTO v_position;

  IF v_position IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'old_number_not_found');
  END IF;

  -- Cria novo array com o número corrigido
  v_new_called_numbers := v_match.called_numbers;
  v_new_called_numbers[v_position] := p_new_number;

  -- Atualiza a partida
  UPDATE public.partidas
  SET called_numbers = v_new_called_numbers
  WHERE id = p_match_id;

  -- Recalcula marcação de TODAS as cartelas automáticas com base no novo called_numbers
  UPDATE public.cartelas_partida cp
  SET marked_numbers = COALESCE((
    SELECT array_agg(s.n ORDER BY s.n)
    FROM (
      SELECT DISTINCT n
      FROM unnest(v_new_called_numbers) AS n
      WHERE jsonb_path_exists(
        cp.numbers,
        '$.** ? (@ == $n)',
        jsonb_build_object('n', n)
      )
    ) AS s
  ), '{}'::integer[])
  WHERE cp.match_id = p_match_id
    AND cp.marking_mode = 'auto';

  GET DIAGNOSTICS v_updated_cards = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'oldNumber', p_old_number,
    'newNumber', p_new_number,
    'position', v_position,
    'totalCalled', array_length(v_new_called_numbers, 1),
    'updatedCards', v_updated_cards
  );
END;
$_$;


ALTER FUNCTION "public"."correct_called_number"("p_match_id" "uuid", "p_old_number" integer, "p_new_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_tie_break_session"("p_match_id" "uuid", "p_player_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match public.partidas%ROWTYPE;
  v_session_id uuid;
  v_split_allowed boolean;
  v_allowed_options text[];
  v_ids_distinct uuid[];
  v_ids_len integer;
  v_cards_len integer;
BEGIN
  IF p_match_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_id_required');
  END IF;

  v_ids_distinct := ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_player_ids, ARRAY[]::uuid[])) AS x
    WHERE x IS NOT NULL
  );

  v_ids_len := COALESCE(array_length(v_ids_distinct, 1), 0);
  IF v_ids_len < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'need_at_least_two_players');
  END IF;

  SELECT *
    INTO v_match
  FROM public.partidas
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  SELECT COUNT(DISTINCT cp.player_id)
    INTO v_cards_len
  FROM public.cartelas_partida cp
  WHERE cp.match_id = p_match_id
    AND cp.credit_type = 'real'
    AND cp.player_id = ANY(v_ids_distinct);

  IF v_cards_len <> v_ids_len THEN
    RETURN jsonb_build_object('success', false, 'error', 'players_not_valid_for_match');
  END IF;

  SELECT id INTO v_session_id
  FROM public.tie_break_sessions
  WHERE match_id = p_match_id
    AND status IN ('voting', 'random_pending')
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    UPDATE public.partidas
    SET tie_break_status = 'pending', tie_break_session_id = v_session_id
    WHERE id = p_match_id;

    RETURN jsonb_build_object(
      'success', true,
      'sessionId', v_session_id,
      'alreadyExists', true
    );
  END IF;

  v_split_allowed := COALESCE(v_match.prize->>'type', '') <> 'product';

  IF v_split_allowed THEN
    v_allowed_options := ARRAY['random_number', 'rematch', 'split_prize']::text[];
  ELSE
    v_allowed_options := ARRAY['random_number', 'rematch']::text[];
  END IF;

  INSERT INTO public.tie_break_sessions (
    match_id,
    admin_id,
    status,
    allowed_options,
    split_allowed
  )
  VALUES (
    p_match_id,
    v_match.admin_id,
    'voting',
    v_allowed_options,
    v_split_allowed
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.tie_break_participants (session_id, player_id)
  SELECT v_session_id, x
  FROM unnest(v_ids_distinct) AS x;

  UPDATE public.partidas
  SET tie_break_status = 'pending', tie_break_session_id = v_session_id
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', v_session_id,
    'splitAllowed', v_split_allowed,
    'allowedOptions', to_jsonb(v_allowed_options)
  );
END;
$$;


ALTER FUNCTION "public"."create_tie_break_session"("p_match_id" "uuid", "p_player_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enviar_acerto_vendedor"("p_vendedor_id" "uuid", "p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[], "p_valor" numeric, "p_comprovante" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vendedores_rifa WHERE id = p_vendedor_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  INSERT INTO acertos_vendedor (vendedor_id, valor, comprovante_url, bingo_ids, rifa_ids)
  VALUES (p_vendedor_id, p_valor, p_comprovante, p_bingo_ids, p_rifa_ids);

  IF array_length(p_bingo_ids, 1) > 0 THEN
    UPDATE vendas_bingo_fisico SET status = 'em_analise' WHERE id = ANY(p_bingo_ids) AND vendedor_id = p_vendedor_id;
  END IF;

  IF array_length(p_rifa_ids, 1) > 0 THEN
    UPDATE compras_rifa SET status = 'em_analise' WHERE id = ANY(p_rifa_ids) AND vendedor_id = p_vendedor_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."enviar_acerto_vendedor"("p_vendedor_id" "uuid", "p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[], "p_valor" numeric, "p_comprovante" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enviar_comprovante_cliente_bingo"("p_codigo" "text", "p_nome" "text", "p_telefone" "text" DEFAULT NULL::"text", "p_endereco" "text" DEFAULT NULL::"text", "p_comprovante" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_venda_bingo_id uuid;
  v_cartela_rifa record;
BEGIN
  -- 1. Tenta achar no Bingo Físico
  SELECT id INTO v_venda_bingo_id 
  FROM public.vendas_bingo_fisico 
  WHERE upper(codigo_validacao) = upper(p_codigo) 
    AND status = 'pendente'
  LIMIT 1;
  
  IF v_venda_bingo_id IS NOT NULL THEN 
    UPDATE public.vendas_bingo_fisico 
    SET status = 'em_analise', 
        nome_comprador = p_nome, 
        telefone_comprador = p_telefone, 
        endereco_comprador = p_endereco,
        comprovante_url = p_comprovante
    WHERE id = v_venda_bingo_id;
    
    RETURN jsonb_build_object('success', true); 
  END IF;

  -- 2. Tenta achar na Rifa
  SELECT cr.id as cartela_id, cr.compra_id, c.status as compra_status, n.id as numero_id
  INTO v_cartela_rifa
  FROM public.cartelas_rifa cr
  JOIN public.compras_rifa c ON c.id = cr.compra_id
  JOIN public.numeros_rifa n ON n.id = cr.numero_rifa_id
  WHERE upper(cr.codigo_validacao) = upper(p_codigo)
  LIMIT 1;

  IF FOUND THEN
    IF v_cartela_rifa.compra_status != 'pendente' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Esta cota não está pendente de pagamento.');
    END IF;

    -- Atualiza a compra para em análise e salva o comprovante
    UPDATE public.compras_rifa
    SET status = 'em_analise',
        comprovante_url = p_comprovante
    WHERE id = v_cartela_rifa.compra_id;

    -- Atualiza os dados do comprador no numero_rifa
    UPDATE public.numeros_rifa
    SET nome_comprador = p_nome,
        telefone_comprador = p_telefone,
        endereco_comprador = p_endereco
    WHERE id = v_cartela_rifa.numero_id;

    RETURN jsonb_build_object('success', true);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Cartela ou Cota não encontrada ou já validada.');
END;
$$;


ALTER FUNCTION "public"."enviar_comprovante_cliente_bingo"("p_codigo" "text", "p_nome" "text", "p_telefone" "text", "p_endereco" "text", "p_comprovante" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalizar_rifa"("p_rifa_id" "uuid", "p_numero_ganhador" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller_role TEXT;
  v_ganhador_id UUID;
BEGIN
  SELECT role INTO v_caller_role FROM perfis WHERE id = auth.uid();
  IF v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT comprador_id INTO v_ganhador_id FROM numeros_rifa
  WHERE rifa_id = p_rifa_id AND numero = p_numero_ganhador;

  UPDATE rifas
  SET status = 'finalizada', numero_ganhador = p_numero_ganhador, ganhador_id = v_ganhador_id
  WHERE id = p_rifa_id;

  RETURN jsonb_build_object('success', true, 'ganhador_id', v_ganhador_id);
END;
$$;


ALTER FUNCTION "public"."finalizar_rifa"("p_rifa_id" "uuid", "p_numero_ganhador" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_tie_break_resolution"("p_match_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match public.partidas%ROWTYPE;
  v_session public.tie_break_sessions%ROWTYPE;
  v_winner uuid;
  v_safe_pot numeric := 0;
  v_prize_value numeric := 0;
  v_total_prize_pool numeric := 0;
  v_payout_applied boolean := false;
BEGIN
  SELECT * INTO v_match
  FROM public.partidas
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  SELECT * INTO v_session
  FROM public.tie_break_sessions
  WHERE match_id = p_match_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'resolved' OR v_session.winner_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'resolved_session_not_found');
  END IF;

  v_winner := v_session.winner_player_id;
  v_payout_applied := COALESCE((v_session.resolution_payload->>'payoutApplied')::boolean, false);

  UPDATE public.partidas
  SET status = 'finished',
      tie_break_status = 'resolved',
      is_auto_calling = false,
      next_auto_call_timestamp = null
  WHERE id = p_match_id;

  IF NOT v_payout_applied THEN
    v_safe_pot := COALESCE(v_match.pot, 0);
    v_prize_value := COALESCE((v_match.prize->>'value')::numeric, 0);

    IF v_match.prize->>'type' = 'fixed' THEN
      v_total_prize_pool := v_prize_value;
    ELSIF v_match.prize->>'type' = 'percentage' THEN
      v_total_prize_pool := (v_safe_pot * v_prize_value) / 100;
    ELSE
      v_total_prize_pool := 0;
    END IF;

    IF v_total_prize_pool > 0 THEN
      PERFORM public.increment_player_credits(
        p_player_id => v_winner,
        p_amount => v_total_prize_pool
      );
    END IF;

    UPDATE public.tie_break_sessions
    SET resolution_payload = COALESCE(resolution_payload, '{}'::jsonb) || jsonb_build_object(
      'payoutApplied', true,
      'paidAmount', v_total_prize_pool
    )
    WHERE id = v_session.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'matchId', p_match_id,
    'winnerPlayerId', v_winner,
    'paidAmount', COALESCE((SELECT (resolution_payload->>'paidAmount')::numeric FROM public.tie_break_sessions WHERE id = v_session.id), v_total_prize_pool)
  );
END;
$$;


ALTER FUNCTION "public"."finalize_tie_break_resolution"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_leaderboard"() RETURNS TABLE("id" "uuid", "full_name" "text", "avatar_url" "text", "win_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH total_vitorias AS (
        -- Vitórias do Bingo
        SELECT player_id FROM public.vitorias
        UNION ALL
        -- Vitórias das Rifas (apenas ganhadores que possuem conta no App)
        SELECT ganhador_id as player_id FROM public.rifas 
        WHERE status = 'finalizada' AND ganhador_id IS NOT NULL
    )
    SELECT 
        p.id, 
        p.full_name, 
        p.avatar_url, 
        COUNT(v.player_id) as win_count
    FROM public.perfis p
    INNER JOIN total_vitorias v ON v.player_id = p.id
    GROUP BY p.id, p.full_name, p.avatar_url
    ORDER BY win_count DESC
    LIMIT 50;
END;
$$;


ALTER FUNCTION "public"."get_leaderboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_profiles"("p_user_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "full_name" "text", "avatar_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.perfis p
  WHERE p.id = ANY(p_user_ids);
$$;


ALTER FUNCTION "public"."get_public_profiles"("p_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_vendedor_by_codigo"("p_codigo_ref" "text") RETURNS TABLE("nome" "text", "telefone" "text", "codigo_ref" "text", "ativo" boolean, "avatar_url" "text", "address" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.nome,
    v.telefone,
    v.codigo_ref,
    v.ativo,
    p.avatar_url,
    p.address
  FROM public.vendedores_rifa v
  JOIN public.perfis p ON v.user_id = p.id
  WHERE v.codigo_ref = p_codigo_ref;
END;
$$;


ALTER FUNCTION "public"."get_public_vendedor_by_codigo"("p_codigo_ref" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_support_contact"("p_admin_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("admin_id" "uuid", "full_name" "text", "whatsapp" "text", "email" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  WITH target_admin AS (
    SELECT a.id, a.full_name, a.whatsapp
    FROM public.admins a
    WHERE (p_admin_id IS NULL OR a.id = p_admin_id)
    ORDER BY (a.id = p_admin_id) DESC, a.id
    LIMIT 1
  )
  SELECT ta.id AS admin_id,
         ta.full_name,
         ta.whatsapp,
         u.email
  FROM target_admin ta
  LEFT JOIN auth.users u ON u.id = ta.id;
$$;


ALTER FUNCTION "public"."get_support_contact"("p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tie_break_session_state"("p_match_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session public.tie_break_sessions%ROWTYPE;
BEGIN
  SELECT s.* INTO v_session
  FROM public.tie_break_sessions s
  WHERE s.match_id = p_match_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'found', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'found', true,
    'session', to_jsonb(v_session),
    'participants', COALESCE((
      SELECT jsonb_agg(to_jsonb(p))
      FROM public.tie_break_participants p
      WHERE p.session_id = v_session.id
    ), '[]'::jsonb),
    'votesCurrentRound', COALESCE((
      SELECT jsonb_agg(to_jsonb(v))
      FROM public.tie_break_votes v
      WHERE v.session_id = v_session.id
        AND v.vote_round = v_session.current_vote_round
    ), '[]'::jsonb),
    'randomCurrentRound', COALESCE((
      SELECT jsonb_agg(to_jsonb(rn))
      FROM public.tie_break_random_numbers rn
      WHERE rn.session_id = v_session.id
        AND rn.random_round = v_session.current_random_round
    ), '[]'::jsonb),
    'randomAllEntries', COALESCE((
      SELECT jsonb_agg(to_jsonb(rn) ORDER BY rn.random_round, rn.generated_number DESC)
      FROM public.tie_break_random_numbers rn
      WHERE rn.session_id = v_session.id
    ), '[]'::jsonb)
  );
END;
$$;


ALTER FUNCTION "public"."get_tie_break_session_state"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_admin_profit"("amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."increment_admin_profit"("amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_player_credits"("p_player_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.perfis
  set credits = credits + p_amount
  where id = p_player_id;
end;
$$;


ALTER FUNCTION "public"."increment_player_credits"("p_player_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_dev"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'dev'
  );
$$;


ALTER FUNCTION "public"."is_dev"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_number_for_match_cards"("p_match_id" "uuid", "p_num" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
declare
  v_updated int;
begin
  update public.cartelas_partida cp
     set marked_numbers =
           array_append(coalesce(cp.marked_numbers, '{}'::int[]), p_num)
   where cp.match_id = p_match_id
     -- CORREÇÃO: APENAS cartelas que estão no modo 'auto' devem ser marcadas pelo sistema.
     and cp.marking_mode = 'auto'
     and not (p_num = any(coalesce(cp.marked_numbers, '{}'::int[])))
     and jsonb_path_exists(
           cp.numbers,
           '$.** ? (@ == $n)',
           jsonb_build_object('n', p_num)
         );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$_$;


ALTER FUNCTION "public"."mark_number_for_match_cards"("p_match_id" "uuid", "p_num" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_festival_round"("p_match_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_match partidas%ROWTYPE;
  v_new_round integer;
  v_next_prize jsonb;
  v_completed jsonb;
BEGIN
  -- Trava a linha da partida
  SELECT * INTO v_match FROM partidas WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.is_festival = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a festival match');
  END IF;

  IF v_match.status != 'finished' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Current round not finished');
  END IF;

  v_new_round := v_match.current_round + 1;

  IF v_new_round >= jsonb_array_length(v_match.prizes) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No more rounds available');
  END IF;

  v_next_prize := v_match.prizes->v_new_round;
  
  -- Salva o histórico da rodada que acabou de encerrar
  v_completed := v_match.completed_rounds || jsonb_build_object(
    'round', v_match.current_round,
    'prize', v_match.prize,
    'winners', v_match.winners
  );

  -- Atualiza a partida para a próxima rodada
  UPDATE partidas 
  SET 
    current_round = v_new_round,
    prize = v_next_prize,
    called_numbers = '{}'::int[],
    winners = '[]'::jsonb,
    status = 'in_progress',
    completed_rounds = v_completed,
    is_auto_calling = false
  WHERE id = p_match_id;

  -- Zera a marcação de todas as cartelas dessa partida (mantém apenas o 0 = espaço livre)
  UPDATE cartelas_partida
  SET marked_numbers = '{0}'::int[]
  WHERE match_id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."next_festival_round"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagar_acerto_com_saldo"("p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_vendedor vendedores_rifa%ROWTYPE;
  v_cfg configuracoes%ROWTYPE;
  v_total_bruto NUMERIC := 0;
  v_comissao_perc NUMERIC;
  v_comissao_total NUMERIC;
  v_liquido_admin NUMERIC;
  v_bingo_venda record;
  v_rifa_compra record;
BEGIN
  -- 1. Get seller and config
  SELECT * INTO v_vendedor FROM vendedores_rifa WHERE user_id = v_user_id AND ativo = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_a_vendor'); END IF;

  SELECT * INTO v_cfg FROM configuracoes LIMIT 1;

  -- 2. Calculate total amount from pending items
  FOR v_bingo_venda IN
    SELECT * FROM vendas_bingo_fisico WHERE id = ANY(p_bingo_ids) AND vendedor_id = v_vendedor.id AND status = 'pendente'
  LOOP
    v_total_bruto := v_total_bruto + v_bingo_venda.valor_pago;
  END LOOP;

  FOR v_rifa_compra IN
    SELECT * FROM compras_rifa WHERE id = ANY(p_rifa_ids) AND vendedor_id = v_vendedor.id AND status = 'pendente'
  LOOP
    v_total_bruto := v_total_bruto + v_rifa_compra.valor_total;
  END LOOP;

  IF v_total_bruto = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_pending_items');
  END IF;

  -- 3. Check balance
  IF (SELECT credits FROM perfis WHERE id = v_user_id) < v_total_bruto THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  -- 4. Debit total from seller
  UPDATE perfis SET credits = credits - v_total_bruto WHERE id = v_user_id;

  -- 5. Calculate commission
  v_comissao_perc := COALESCE(v_vendedor.comissao_percentual, 0);
  IF v_comissao_perc = 0 THEN
    v_comissao_perc := COALESCE(v_cfg.comissao_vendedor_global, 0);
  END IF;
  v_comissao_total := v_total_bruto * (v_comissao_perc / 100.0);

  -- 6. Credit commission back to seller
  IF v_comissao_total > 0 THEN
    UPDATE perfis SET credits = credits + v_comissao_total WHERE id = v_user_id;
  END IF;

  -- 7. Credit admin profit
  v_liquido_admin := v_total_bruto - v_comissao_total;
  IF v_liquido_admin > 0 THEN
    PERFORM public.increment_admin_profit(v_liquido_admin);
  END IF;

  -- 8. Mark items as paid
  UPDATE vendas_bingo_fisico SET status = 'pago' WHERE id = ANY(p_bingo_ids);
  UPDATE compras_rifa SET status = 'pago' WHERE id = ANY(p_rifa_ids);
  
  -- Add to pot for bingo matches
  FOR v_bingo_venda IN
    SELECT * FROM vendas_bingo_fisico WHERE id = ANY(p_bingo_ids)
  LOOP
    UPDATE partidas SET pot = pot + v_bingo_venda.valor_pago WHERE id = v_bingo_venda.match_id;
  END LOOP;

  -- 9. Create a settlement record for history
  INSERT INTO acertos_vendedor (vendedor_id, valor, status, bingo_ids, rifa_ids, repasse_concluido, comissao_paga, resolved_at, resolved_by)
  VALUES (v_vendedor.id, v_total_bruto, 'aprovado', p_bingo_ids, p_rifa_ids, true, v_comissao_total, now(), v_user_id);

  RETURN jsonb_build_object('success', true, 'total_pago', v_total_bruto, 'comissao_recebida', v_comissao_total);
END;
$$;


ALTER FUNCTION "public"."pagar_acerto_com_saldo"("p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagar_comissao_acerto_manual"("p_acerto_id" "uuid", "p_valor_comissao" numeric, "p_descontar_admin" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_acerto acertos_vendedor%ROWTYPE;
  v_vendedor_user_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('success', false, 'error', 'unauthorized'); END IF;

  SELECT * INTO v_acerto FROM acertos_vendedor WHERE id = p_acerto_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;

  SELECT user_id INTO v_vendedor_user_id FROM vendedores_rifa WHERE id = v_acerto.vendedor_id;

  -- 1. Paga o vendedor (adiciona aos créditos dele)
  IF v_vendedor_user_id IS NOT NULL AND p_valor_comissao > 0 THEN
      UPDATE perfis SET credits = credits + p_valor_comissao WHERE id = v_vendedor_user_id;
  END IF;

  -- 2. Desconta do admin (se a caixinha estiver marcada no painel)
  IF p_valor_comissao > 0 AND p_descontar_admin THEN
      PERFORM public.increment_admin_profit(-p_valor_comissao);
  END IF;

  -- 3. Atualiza o acerto para registrar que a comissão foi paga
  UPDATE acertos_vendedor SET comissao_paga = COALESCE(comissao_paga, 0) + p_valor_comissao WHERE id = p_acerto_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."pagar_comissao_acerto_manual"("p_acerto_id" "uuid", "p_valor_comissao" numeric, "p_descontar_admin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagar_compras_saldo"("p_compra_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_total NUMERIC := 0;
  v_compra record;
BEGIN
  -- Somar total das compras que estão pendentes e pertencem a esse vendedor
  FOR v_compra IN 
    SELECT cr.* FROM compras_rifa cr
    JOIN vendedores_rifa vr ON vr.id = cr.vendedor_id
    WHERE cr.id = ANY(p_compra_ids) 
      AND cr.status = 'pendente' 
      AND vr.user_id = v_user_id
  LOOP
    v_total := v_total + v_compra.valor_total;
  END LOOP;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhuma compra pendente encontrada ou já paga.');
  END IF;

  -- Checar saldo do usuário
  IF (SELECT credits FROM perfis WHERE id = v_user_id) < v_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  -- Debitar saldo
  UPDATE perfis SET credits = credits - v_total WHERE id = v_user_id;

  -- Atualizar status das compras para 'pago'
  UPDATE compras_rifa SET status = 'pago' WHERE id = ANY(p_compra_ids) AND status = 'pendente';

  RETURN jsonb_build_object('success', true, 'total_pago', v_total);
END;
$$;


ALTER FUNCTION "public"."pagar_compras_saldo"("p_compra_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."popular_numeros_rifa"("p_rifa_id" "uuid", "p_inicio" integer, "p_quantidade" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO numeros_rifa (rifa_id, numero)
  SELECT p_rifa_id, generate_series(p_inicio, p_inicio + p_quantidade - 1);
END;
$$;


ALTER FUNCTION "public"."popular_numeros_rifa"("p_rifa_id" "uuid", "p_inicio" integer, "p_quantidade" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preparar_cartela_para_pagamento"("p_codigo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_cartela cartelas_rifa%ROWTYPE;
    v_compra compras_rifa%ROWTYPE;
    v_numero_rifa numeros_rifa%ROWTYPE;
    v_new_compra_id UUID;
    v_unit_value NUMERIC;
    v_new_numeros INT[];
BEGIN
    -- Busca a cartela pelo código
    SELECT * INTO v_cartela FROM cartelas_rifa WHERE upper(codigo_validacao) = upper(p_codigo);
    IF NOT FOUND THEN RETURN; END IF;

    -- Busca a compra (carrinho) associada
    SELECT * INTO v_compra FROM compras_rifa WHERE id = v_cartela.compra_id;
    
    -- Se já for um bilhete individual ou não existir, ignora e sai
    IF v_compra.id IS NULL OR array_length(v_compra.numeros, 1) <= 1 THEN
        RETURN;
    END IF;

    -- Recupera o número específico desta cartela
    SELECT * INTO v_numero_rifa FROM numeros_rifa WHERE id = v_cartela.numero_rifa_id;

    -- Calcula o valor de 1 único bilhete
    v_unit_value := v_compra.valor_total / array_length(v_compra.numeros, 1);
    v_new_numeros := array_remove(v_compra.numeros, v_numero_rifa.numero);

    -- 1. Cria uma nova compra individual apenas para este bilhete
    INSERT INTO compras_rifa (rifa_id, comprador_id, vendedor_id, cliente_rifa_id, ref_vendedor_id, numeros, valor_total, desconto_aplicado, tipo_pagamento, status, admin_id, created_at)
    VALUES (v_compra.rifa_id, v_compra.comprador_id, v_compra.vendedor_id, v_compra.cliente_rifa_id, v_compra.ref_vendedor_id, ARRAY[v_numero_rifa.numero], v_unit_value, v_compra.desconto_aplicado, v_compra.tipo_pagamento, v_compra.status, v_compra.admin_id, v_compra.created_at)
    RETURNING id INTO v_new_compra_id;

    -- 2. Atualiza a cartela física para apontar para a nova compra individual
    UPDATE cartelas_rifa SET compra_id = v_new_compra_id WHERE id = v_cartela.id;

    -- 3. Atualiza o carrinho original (remove o número destacado e subtrai o valor)
    UPDATE compras_rifa 
    SET numeros = v_new_numeros, 
        valor_total = GREATEST(0, valor_total - v_unit_value)
    WHERE id = v_compra.id;
END;
$$;


ALTER FUNCTION "public"."preparar_cartela_para_pagamento"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_redeem_request"("p_player_id" "uuid", "p_credits" numeric, "p_amount" numeric, "p_message" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_profile    perfis%ROWTYPE;
  v_request_id UUID;
BEGIN
  SELECT * INTO v_profile FROM perfis WHERE id = p_player_id FOR UPDATE;

  IF v_profile.credits < p_credits THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  UPDATE perfis SET credits = credits - p_credits WHERE id = p_player_id;

  INSERT INTO solicitacoes_resgate (player_id, credits_requested, amount_to_receive, status)
  VALUES (p_player_id, p_credits, p_amount, 'pending')
  RETURNING id INTO v_request_id;

  IF p_message IS NOT NULL THEN
    INSERT INTO mensagens_resgate (redeem_request_id, sender_id, message)
    VALUES (v_request_id, p_player_id, p_message);
  END IF;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$;


ALTER FUNCTION "public"."process_redeem_request"("p_player_id" "uuid", "p_credits" numeric, "p_amount" numeric, "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_stripe_payment"("p_session_id" "text", "p_user_id" "uuid", "p_amount" numeric, "p_payment_type" "text", "p_original_amount" numeric, "p_credits_requested" numeric, "p_venda_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_exists boolean;
    v_config_id uuid;
    v_admin_id uuid;
    v_history_id uuid;
    v_venda_bingo record;
    v_venda_rifa record;
    v_comissao_perc numeric;
    v_comissao_valor numeric := 0;
    v_vendedor_user_id uuid;
    v_lucro_admin numeric;
BEGIN
    -- 1. Evita duplicidade (garante que um pagamento não entre 2 vezes)
    SELECT EXISTS(SELECT 1 FROM stripe_payments WHERE stripe_session_id = p_session_id AND status = 'completed') INTO v_exists;
    IF v_exists THEN
        RETURN jsonb_build_object('success', true, 'message', 'already_processed');
    END IF;

    -- 2. Salva o registro bruto do Stripe
    INSERT INTO stripe_payments (stripe_session_id, user_id, amount, status, payment_type)
    VALUES (p_session_id, p_user_id, p_amount, 'completed', p_payment_type);

    -- Pega as configs globais do Admin
    SELECT id, admin_id, comissao_vendedor_global INTO v_config_id, v_admin_id, v_comissao_perc FROM configuracoes LIMIT 1;

    -- ===================================================================================
    -- FLUXO 1: COMPRA DIRETA DE CRÉDITOS (A matemática principal)
    -- ===================================================================================
    IF p_payment_type = 'credits' AND p_user_id IS NOT NULL THEN
        -- 1. Credita jogador (+1.00)
        UPDATE perfis SET credits = COALESCE(credits, 0) + p_credits_requested WHERE id = p_user_id;
        
        -- 2. Credita Admin (+1.00, ignorando as taxas que ficaram no Stripe)
        UPDATE configuracoes SET admin_profit = COALESCE(admin_profit, 0) + p_original_amount WHERE id = v_config_id;
        
        -- 3. Salva Histórico visível para o Admin
        INSERT INTO solicitacoes_credito (player_id, status, credits_requested, credits_granted, amount_paid, receipt_url, notes, resolved_at, repasse_concluido, admin_id)
        VALUES (p_user_id, 'approved', p_credits_requested, p_credits_requested, p_amount, 'STRIPE_' || p_session_id, 'Pagamento automático via Cartão (Stripe).', NOW(), true, v_admin_id)
        RETURNING id INTO v_history_id;

        INSERT INTO mensagens_solicitacao (credit_request_id, sender_id, message)
        VALUES (v_history_id, p_user_id, '✅ Pagamento automático aprovado via Cartão de Crédito.');
        
        RETURN jsonb_build_object('success', true, 'message', 'credits_added');
    END IF;

    -- ===================================================================================
    -- FLUXO 2: VALIDAÇÃO DE CARTELA BINGO (Paga comissão se foi de vendedor)
    -- ===================================================================================
    IF p_payment_type = 'venda_bingo' AND p_venda_id IS NOT NULL THEN
        SELECT * INTO v_venda_bingo FROM vendas_bingo_fisico WHERE id = p_venda_id;
        IF FOUND AND v_venda_bingo.status != 'pago' THEN
            -- Marca como pago
            UPDATE vendas_bingo_fisico SET status = 'pago' WHERE id = p_venda_id;
            -- Adiciona ao Pote da Partida
            UPDATE partidas SET pot = COALESCE(pot, 0) + p_original_amount WHERE id = v_venda_bingo.match_id;

            -- Calcula Comissão do Vendedor (se existir)
            IF v_venda_bingo.vendedor_id IS NOT NULL THEN
                SELECT user_id, comissao_percentual INTO v_vendedor_user_id, v_comissao_perc FROM vendedores_rifa WHERE id = v_venda_bingo.vendedor_id;
                IF v_comissao_perc IS NULL OR v_comissao_perc = 0 THEN
                    SELECT comissao_vendedor_global INTO v_comissao_perc FROM configuracoes LIMIT 1;
                END IF;
                IF v_comissao_perc > 0 THEN
                    v_comissao_valor := p_original_amount * (v_comissao_perc / 100.0);
                    UPDATE perfis SET credits = COALESCE(credits, 0) + v_comissao_valor WHERE id = v_vendedor_user_id;
                END IF;
            END IF;

            -- Resto vai pro caixa do Admin
            v_lucro_admin := p_original_amount - v_comissao_valor;
            UPDATE configuracoes SET admin_profit = COALESCE(admin_profit, 0) + v_lucro_admin WHERE id = v_config_id;
            
            RETURN jsonb_build_object('success', true, 'message', 'bingo_validated');
        END IF;
    END IF;

    -- ===================================================================================
    -- FLUXO 3: VALIDAÇÃO DE RIFA (Paga comissão se foi de vendedor)
    -- ===================================================================================
    IF p_payment_type = 'venda_rifa' AND p_venda_id IS NOT NULL THEN
        SELECT * INTO v_venda_rifa FROM compras_rifa WHERE id = p_venda_id;
        IF FOUND AND v_venda_rifa.status != 'pago' THEN
            UPDATE compras_rifa SET status = 'pago' WHERE id = p_venda_id;

            IF v_venda_rifa.vendedor_id IS NOT NULL OR v_venda_rifa.ref_vendedor_id IS NOT NULL THEN
                SELECT user_id, comissao_percentual INTO v_vendedor_user_id, v_comissao_perc FROM vendedores_rifa WHERE id = COALESCE(v_venda_rifa.vendedor_id, v_venda_rifa.ref_vendedor_id);
                IF v_comissao_perc IS NULL OR v_comissao_perc = 0 THEN
                    SELECT comissao_vendedor_global INTO v_comissao_perc FROM configuracoes LIMIT 1;
                END IF;
                IF v_comissao_perc > 0 THEN
                    v_comissao_valor := p_original_amount * (v_comissao_perc / 100.0);
                    UPDATE perfis SET credits = COALESCE(credits, 0) + v_comissao_valor WHERE id = v_vendedor_user_id;
                END IF;
            END IF;

            v_lucro_admin := p_original_amount - v_comissao_valor;
            UPDATE configuracoes SET admin_profit = COALESCE(admin_profit, 0) + v_lucro_admin WHERE id = v_config_id;

            RETURN jsonb_build_object('success', true, 'message', 'rifa_validated');
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'unhandled_type_or_already_paid');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."process_stripe_payment"("p_session_id" "text", "p_user_id" "uuid", "p_amount" numeric, "p_payment_type" "text", "p_original_amount" numeric, "p_credits_requested" numeric, "p_venda_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promover_para_admin"("p_user_id" "uuid", "p_modulo_bingo" boolean DEFAULT true, "p_modulo_rifa" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'dev') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM perfis WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  UPDATE perfis SET role = 'admin' WHERE id = p_user_id;

  INSERT INTO admin_modulos (admin_id, modulo_bingo, modulo_rifa)
  VALUES (p_user_id, p_modulo_bingo, p_modulo_rifa)
  ON CONFLICT (admin_id) DO UPDATE
    SET modulo_bingo = EXCLUDED.modulo_bingo, modulo_rifa = EXCLUDED.modulo_rifa;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."promover_para_admin"("p_user_id" "uuid", "p_modulo_bingo" boolean, "p_modulo_rifa" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rebaixar_admin"("p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'dev') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE perfis SET role = 'user' WHERE id = p_admin_id AND role = 'admin';
  DELETE FROM admin_modulos WHERE admin_id = p_admin_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."rebaixar_admin"("p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recarregar_fake_credits"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE perfis
  SET fake_credits = COALESCE(fake_credits, 0) + 1000
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."recarregar_fake_credits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_winner"("p_match_id" "uuid", "p_player_id" "uuid", "p_player_card_id" "uuid", "p_match_card_id" "uuid", "p_prize_details" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into public.vitorias(match_id, player_id, player_card_id, match_card_id, prize_details)
  values (p_match_id, p_player_id, p_player_card_id, p_match_card_id, p_prize_details)
  on conflict (match_id, match_card_id) do nothing;
end;
$$;


ALTER FUNCTION "public"."record_winner"("p_match_id" "uuid", "p_player_id" "uuid", "p_player_card_id" "uuid", "p_match_card_id" "uuid", "p_prize_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rejeitar_pagamento_cliente_bingo"("p_venda_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT public.is_admin() THEN 
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized'); 
  END IF;

  UPDATE public.vendas_bingo_fisico 
  SET status = 'pendente', 
      comprovante_url = NULL 
  WHERE id = p_venda_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."rejeitar_pagamento_cliente_bingo"("p_venda_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rejeitar_pagamento_cliente_rifa"("p_venda_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('success', false, 'error', 'unauthorized'); END IF;

  UPDATE public.compras_rifa 
  SET status = 'pendente', 
      comprovante_url = NULL 
  WHERE id = p_venda_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."rejeitar_pagamento_cliente_rifa"("p_venda_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rejeitar_vendedor"("p_solicitacao_id" "uuid", "p_mensagem_admin" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM perfis WHERE id = auth.uid();
  IF v_caller_role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE solicitacoes_vendedor
  SET status = 'rejeitado', mensagem_admin = p_mensagem_admin, resolved_at = now(), resolved_by = auth.uid()
  WHERE id = p_solicitacao_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."rejeitar_vendedor"("p_solicitacao_id" "uuid", "p_mensagem_admin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_redeem"("p_credits" numeric, "p_amount" numeric, "p_message" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_player_id UUID;
  v_current_credits NUMERIC;
  v_admin_id UUID;
  v_request_id UUID;
BEGIN
  -- SEGURANÇA: Validação de Entrada
  IF p_credits <= 0 OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_amount_or_credits');
  END IF;

  v_player_id := auth.uid();
  IF v_player_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Busca de dados e bloqueio de linha (Race Condition Prevention)
  SELECT credits, admins_id INTO v_current_credits, v_admin_id 
  FROM perfis 
  WHERE id = v_player_id FOR UPDATE;
  
  IF v_current_credits < p_credits THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  -- Débito atômico do jogador
  UPDATE perfis SET credits = credits - p_credits WHERE id = v_player_id;

  -- Inserção na tabela principal (Corrigido para admin_id)
  INSERT INTO solicitacoes_resgate (player_id, credits_requested, amount_to_receive, status, admin_id)
  VALUES (v_player_id, p_credits, p_amount, 'pending', v_admin_id)
  RETURNING id INTO v_request_id;

  -- Inserção da mensagem inicial (Corrigido para admin_id)
  IF p_message IS NOT NULL AND trim(p_message) <> '' THEN
    INSERT INTO mensagens_resgate (redeem_request_id, sender_id, message, admin_id)
    VALUES (v_request_id, v_player_id, trim(p_message), v_admin_id);
  END IF;

  RETURN json_build_object('success', true, 'request_id', v_request_id);
END;
$$;


ALTER FUNCTION "public"."request_redeem"("p_credits" numeric, "p_amount" numeric, "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reservar_numeros_vendedor"("p_rifa_id" "uuid", "p_numeros" integer[], "p_pagar_depois" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_vendedor vendedores_rifa%ROWTYPE;
  v_rifa rifas%ROWTYPE;
  v_preco_unit NUMERIC;
  v_desconto NUMERIC;
  v_total NUMERIC;
  v_compra_id UUID;
  v_num INT;
  v_cfg configuracoes%ROWTYPE;
BEGIN
  -- Busca Vendedor
  SELECT * INTO v_vendedor FROM vendedores_rifa WHERE user_id = v_user_id AND ativo = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_a_vendor'); END IF;

  -- Busca Rifa
  SELECT * INTO v_rifa FROM rifas WHERE id = p_rifa_id AND status = 'ativa' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'rifa_not_found'); END IF;
  
  -- Busca Config
  SELECT * INTO v_cfg FROM configuracoes LIMIT 1;

  -- RESOLVE DESCONTO CORRETAMENTE (Se for <= 0, puxa o global)
  IF v_rifa.preco_vendedor IS NOT NULL AND v_rifa.preco_vendedor > 0 THEN
    v_preco_unit := v_rifa.preco_vendedor;
    v_desconto := ROUND(100 - (v_rifa.preco_vendedor / NULLIF(v_rifa.custo_por_numero, 0) * 100), 2);
  ELSE
    v_desconto := COALESCE(v_vendedor.percentual_desconto, 0);
    IF v_desconto <= 0 THEN
        v_desconto := COALESCE(v_cfg.desconto_vendedor_global, 0);
    END IF;
    -- Calcula preco unitario aplicando o desconto percentual
    v_preco_unit := v_rifa.custo_por_numero * (1.0 - (v_desconto / 100.0));
  END IF;

  -- Total exato a cobrar do saldo
  v_total := array_length(p_numeros, 1) * v_preco_unit;

  -- Se for pagamento IMEDIATO, debita do saldo agora
  IF NOT p_pagar_depois THEN
    IF (SELECT credits FROM perfis WHERE id = v_user_id) < v_total THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
    END IF;
    UPDATE perfis SET credits = credits - v_total WHERE id = v_user_id;
  END IF;

  -- Atualiza o status dos números na cartela
  FOR v_num IN SELECT unnest(p_numeros) LOOP
    UPDATE numeros_rifa 
    SET status = CASE WHEN p_pagar_depois THEN 'reservado' ELSE 'vendido' END, 
        vendedor_id = v_vendedor.id,
        comprador_id = CASE WHEN p_pagar_depois THEN NULL ELSE v_user_id END
    WHERE rifa_id = p_rifa_id AND numero = v_num AND status = 'disponivel';
    
    IF NOT FOUND THEN RAISE EXCEPTION 'numero_indisponivel:%', v_num; END IF;
  END LOOP;

  -- Salva no histórico de compras
  INSERT INTO compras_rifa (rifa_id, vendedor_id, numeros, valor_total, desconto_aplicado, tipo_pagamento, status)
  VALUES (p_rifa_id, v_vendedor.id, p_numeros, v_total, v_desconto, 'vendedor', CASE WHEN p_pagar_depois THEN 'pendente' ELSE 'pago' END)
  RETURNING id INTO v_compra_id;

  INSERT INTO cartelas_rifa (numero_rifa_id, compra_id)
  SELECT nr.id, v_compra_id FROM numeros_rifa nr WHERE nr.rifa_id = p_rifa_id AND nr.numero = ANY(p_numeros);

  -- NOTA: O Caixa do Admin NÃO é mais incrementado aqui, pois os créditos usados já geraram lucro quando foram comprados.

  RETURN jsonb_build_object('success', true, 'compra_id', v_compra_id, 'total', v_total, 'preco_unitario', v_preco_unit);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."reservar_numeros_vendedor"("p_rifa_id" "uuid", "p_numeros" integer[], "p_pagar_depois" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolver_acerto_vendedor"("p_acerto_id" "uuid", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_acerto acertos_vendedor%ROWTYPE;
  v_bingo_id UUID;
  v_rifa_id UUID;
  v_vendedor vendedores_rifa%ROWTYPE;
  v_cfg configuracoes%ROWTYPE;
  v_comissao_perc numeric;
  v_total_bruto numeric := 0;
  v_comissao_total numeric := 0;
  v_liquido_admin numeric := 0;
  v_valor_item numeric;
BEGIN
  -- Verifica permissão
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('success', false, 'error', 'unauthorized'); END IF;

  -- Busca o acerto
  SELECT * INTO v_acerto FROM acertos_vendedor WHERE id = p_acerto_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;

  -- Busca o Vendedor e as Configurações
  SELECT * INTO v_vendedor FROM vendedores_rifa WHERE id = v_acerto.vendedor_id;
  SELECT * INTO v_cfg FROM configuracoes LIMIT 1;

  -- Define a % de comissão (do vendedor ou global)
  v_comissao_perc := COALESCE(v_vendedor.comissao_percentual, 0);
  IF v_comissao_perc = 0 THEN
    v_comissao_perc := COALESCE(v_cfg.comissao_vendedor_global, 0);
  END IF;

  -- Atualiza o status inicial
  UPDATE acertos_vendedor SET status = p_status, resolved_at = now(), resolved_by = auth.uid() WHERE id = p_acerto_id;

  IF p_status = 'aprovado' AND NOT COALESCE(v_acerto.repasse_concluido, false) THEN
    
    -- 1. Soma os valores brutos dos Bingos e repassa pro Pote
    IF array_length(v_acerto.bingo_ids, 1) > 0 THEN
      FOR v_bingo_id IN SELECT unnest(v_acerto.bingo_ids) LOOP
        SELECT valor_pago INTO v_valor_item FROM vendas_bingo_fisico WHERE id = v_bingo_id;
        v_total_bruto := v_total_bruto + COALESCE(v_valor_item, 0);
        
        -- Adiciona o valor no Pote da Partida
        UPDATE partidas SET pot = pot + COALESCE(v_valor_item, 0) WHERE id = (SELECT match_id FROM vendas_bingo_fisico WHERE id = v_bingo_id);
        -- Quita o bingo
        UPDATE vendas_bingo_fisico SET status = 'pago' WHERE id = v_bingo_id;
      END LOOP;
    END IF;

    -- 2. Soma os valores brutos das Rifas
    IF array_length(v_acerto.rifa_ids, 1) > 0 THEN
      FOR v_rifa_id IN SELECT unnest(v_acerto.rifa_ids) LOOP
        SELECT valor_total INTO v_valor_item FROM compras_rifa WHERE id = v_rifa_id;
        v_total_bruto := v_total_bruto + COALESCE(v_valor_item, 0);
        
        -- Quita a rifa
        UPDATE compras_rifa SET status = 'pago' WHERE id = v_rifa_id;
      END LOOP;
    END IF;

    -- Fallback de segurança: Se não achou itens, usa o valor declarado
    IF v_total_bruto = 0 THEN
        v_total_bruto := v_acerto.valor;
    END IF;

    -- 3. A MÁGICA DA DIVISÃO: Calcula Comissão e Líquido
    v_comissao_total := v_total_bruto * (v_comissao_perc / 100.0);
    v_liquido_admin := v_total_bruto - v_comissao_total;

    -- 4. Paga o Vendedor (Coloca o saldo na conta dele)
    IF v_comissao_total > 0 THEN
       UPDATE perfis SET credits = credits + v_comissao_total WHERE id = v_vendedor.user_id;
    END IF;

    -- 5. Paga o Admin (Coloca o líquido no caixa da plataforma)
    IF v_liquido_admin > 0 THEN
       PERFORM public.increment_admin_profit(v_liquido_admin);
    END IF;

    -- 6. Registra na tabela de acertos o que foi feito
    UPDATE acertos_vendedor 
    SET repasse_concluido = true, 
        comissao_paga = v_comissao_total,
        valor = v_total_bruto -- Ajusta para garantir que reflete a realidade dos bilhetes
    WHERE id = p_acerto_id;

  ELSIF p_status = 'rejeitado' THEN
    -- Devolve os bilhetes para Pendente (Fiado)
    IF array_length(v_acerto.bingo_ids, 1) > 0 THEN
      UPDATE vendas_bingo_fisico SET status = 'pendente' WHERE id = ANY(v_acerto.bingo_ids);
    END IF;
    IF array_length(v_acerto.rifa_ids, 1) > 0 THEN
      UPDATE compras_rifa SET status = 'pendente' WHERE id = ANY(v_acerto.rifa_ids);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."resolver_acerto_vendedor"("p_acerto_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_id_from_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.admin_id IS NULL THEN
    NEW.admin_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_admin_id_from_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_id_from_auth_pagbank"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.admin_id IS NULL THEN
    -- Puxa o admins_id do perfil de quem está logado, se for usuário normal
    -- Ou pega o próprio id se for admin
    SELECT COALESCE(admins_id, id) INTO NEW.admin_id FROM public.perfis WHERE id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_admin_id_from_auth_pagbank"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_id_from_match"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.admin_id IS NULL THEN
    SELECT admin_id INTO NEW.admin_id FROM public.partidas WHERE id = NEW.match_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_admin_id_from_match"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_id_from_player"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  IF NEW.admin_id IS NULL THEN
    -- Puxa o admins_id do perfil de quem está logado
    SELECT admins_id INTO v_admin_id FROM public.perfis WHERE id = auth.uid();
    IF v_admin_id IS NOT NULL THEN
      NEW.admin_id := v_admin_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_admin_id_from_player"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_id_from_redeem_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- SEGURANÇA: Sempre pega o admin_id da solicitação pai (Zero Trust no input do cliente)
  SELECT admin_id INTO NEW.admin_id 
  FROM public.solicitacoes_resgate 
  WHERE id = NEW.redeem_request_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_admin_id_from_redeem_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_id_from_rifa"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.admin_id IS NULL THEN
    SELECT admin_id INTO NEW.admin_id FROM public.rifas WHERE id = NEW.rifa_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_admin_id_from_rifa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_manual_mode"("p_card_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.cartelas_partida
    SET marking_mode = 'manual'
    WHERE id = p_card_id AND player_id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'card_not_found_or_unauthorized');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."set_manual_mode"("p_card_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_tie_break_random_number"("p_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_session public.tie_break_sessions%ROWTYPE;
  v_match public.partidas%ROWTYPE;
  v_round integer;
  v_total_active integer;
  v_submitted integer;
  v_generated integer;
  v_highest integer;
  v_highest_count integer;
  v_winner uuid;
  v_tied_ids uuid[];
  v_safe_pot numeric := 0;
  v_prize_value numeric := 0;
  v_total_prize_pool numeric := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT *
    INTO v_session
  FROM public.tie_break_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  IF v_session.status <> 'random_pending' OR v_session.selected_resolution <> 'random_number' THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_ready_for_random');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tie_break_participants p
    WHERE p.session_id = v_session.id
      AND p.player_id = v_user_id
      AND p.is_active_random = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'player_not_active_for_random_round');
  END IF;

  v_round := v_session.current_random_round;
  -- CORRIGIDO: usa random() nativo do PostgreSQL (1 a 999999)
  v_generated := (floor(random() * 999999) + 1)::integer;

  INSERT INTO public.tie_break_random_numbers (session_id, random_round, player_id, generated_number)
  VALUES (v_session.id, v_round, v_user_id, v_generated)
  ON CONFLICT (session_id, random_round, player_id)
  DO UPDATE SET generated_number = EXCLUDED.generated_number;

  SELECT COUNT(*) INTO v_total_active
  FROM public.tie_break_participants
  WHERE session_id = v_session.id
    AND is_active_random = true;

  SELECT COUNT(*) INTO v_submitted
  FROM public.tie_break_random_numbers rn
  JOIN public.tie_break_participants p
    ON p.session_id = rn.session_id
   AND p.player_id = rn.player_id
  WHERE rn.session_id = v_session.id
    AND rn.random_round = v_round
    AND p.is_active_random = true;

  IF v_submitted < v_total_active THEN
    RETURN jsonb_build_object(
      'success', true,
      'round', v_round,
      'generatedNumber', v_generated,
      'waitingForNumbers', true,
      'submittedCount', v_submitted,
      'totalActiveParticipants', v_total_active
    );
  END IF;

  -- Todos submeteram: encontrar o maior número
  SELECT MAX(generated_number) INTO v_highest
  FROM public.tie_break_random_numbers rn
  JOIN public.tie_break_participants p
    ON p.session_id = rn.session_id
   AND p.player_id = rn.player_id
  WHERE rn.session_id = v_session.id
    AND rn.random_round = v_round
    AND p.is_active_random = true;

  SELECT COUNT(*) INTO v_highest_count
  FROM public.tie_break_random_numbers rn
  JOIN public.tie_break_participants p
    ON p.session_id = rn.session_id
   AND p.player_id = rn.player_id
  WHERE rn.session_id = v_session.id
    AND rn.random_round = v_round
    AND rn.generated_number = v_highest
    AND p.is_active_random = true;

  IF v_highest_count = 1 THEN
    -- Vencedor único!
    SELECT rn.player_id INTO v_winner
    FROM public.tie_break_random_numbers rn
    JOIN public.tie_break_participants p
      ON p.session_id = rn.session_id
     AND p.player_id = rn.player_id
    WHERE rn.session_id = v_session.id
      AND rn.random_round = v_round
      AND rn.generated_number = v_highest
      AND p.is_active_random = true
    LIMIT 1;

    UPDATE public.tie_break_sessions
    SET status = 'resolved',
        winner_player_id = v_winner,
        resolution_payload = COALESCE(resolution_payload, '{}'::jsonb) || jsonb_build_object(
          'randomRoundResolved', v_round,
          'winningNumber', v_highest,
          'winnerPlayerId', v_winner
        )
    WHERE id = v_session.id;

    UPDATE public.partidas
    SET status = 'finished',
        tie_break_status = 'resolved',
        is_auto_calling = false,
        next_auto_call_timestamp = null
    WHERE id = v_session.match_id;

    SELECT *
      INTO v_match
    FROM public.partidas
    WHERE id = v_session.match_id;

    v_safe_pot := COALESCE(v_match.pot, 0);
    v_prize_value := COALESCE((v_match.prize->>'value')::numeric, 0);

    IF v_match.prize->>'type' = 'fixed' THEN
      v_total_prize_pool := v_prize_value;
    ELSIF v_match.prize->>'type' = 'percentage' THEN
      v_total_prize_pool := (v_safe_pot * v_prize_value) / 100;
    ELSE
      v_total_prize_pool := 0;
    END IF;

    IF v_total_prize_pool > 0 THEN
      PERFORM public.increment_player_credits(
        p_player_id => v_winner,
        p_amount => v_total_prize_pool
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'round', v_round,
      'resolved', true,
      'winnerPlayerId', v_winner,
      'winningNumber', v_highest,
      'paidAmount', v_total_prize_pool,
      'generatedNumber', v_generated
    );
  ELSE
    -- Empate nos números: avança para próxima rodada aleatória com apenas os empatados
    SELECT ARRAY_AGG(rn.player_id) INTO v_tied_ids
    FROM public.tie_break_random_numbers rn
    JOIN public.tie_break_participants p
      ON p.session_id = rn.session_id
     AND p.player_id = rn.player_id
    WHERE rn.session_id = v_session.id
      AND rn.random_round = v_round
      AND rn.generated_number = v_highest
      AND p.is_active_random = true;

    UPDATE public.tie_break_participants
    SET is_active_random = (player_id = ANY(v_tied_ids))
    WHERE session_id = v_session.id;

    UPDATE public.tie_break_sessions
    SET current_random_round = current_random_round + 1
    WHERE id = v_session.id;

    RETURN jsonb_build_object(
      'success', true,
      'round', v_round,
      'needsAnotherRandomRound', true,
      'tiedPlayerIds', v_tied_ids,
      'generatedNumber', v_generated
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."submit_tie_break_random_number"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_tie_break_vote"("p_session_id" "uuid", "p_option" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_session public.tie_break_sessions%ROWTYPE;
  v_match public.partidas%ROWTYPE;
  v_round integer;
  v_total integer;
  v_voted integer;
  v_max_count integer;
  v_winner_option text;
  v_options_at_max integer;
  v_participant_ids uuid[];
  v_participant_count integer := 0;
  v_safe_pot numeric := 0;
  v_prize_value numeric := 0;
  v_total_prize_pool numeric := 0;
  v_split_each numeric := 0;
  v_player_id uuid;
  v_new_match_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT *
    INTO v_session
  FROM public.tie_break_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  IF v_session.status <> 'voting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_in_voting');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tie_break_participants p
    WHERE p.session_id = v_session.id
      AND p.player_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;

  IF NOT (p_option = ANY(v_session.allowed_options)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'option_not_allowed');
  END IF;

  v_round := v_session.current_vote_round;

  INSERT INTO public.tie_break_votes (session_id, vote_round, player_id, option)
  VALUES (v_session.id, v_round, v_user_id, p_option)
  ON CONFLICT (session_id, vote_round, player_id)
  DO UPDATE SET option = EXCLUDED.option;

  SELECT COUNT(*) INTO v_total
  FROM public.tie_break_participants
  WHERE session_id = v_session.id;

  SELECT COUNT(*) INTO v_voted
  FROM public.tie_break_votes
  WHERE session_id = v_session.id
    AND vote_round = v_round;

  IF v_voted < v_total THEN
    RETURN jsonb_build_object(
      'success', true,
      'round', v_round,
      'waitingForVotes', true,
      'votedCount', v_voted,
      'totalParticipants', v_total
    );
  END IF;

  SELECT t.option, t.cnt
    INTO v_winner_option, v_max_count
  FROM (
    SELECT option, COUNT(*) AS cnt
    FROM public.tie_break_votes
    WHERE session_id = v_session.id
      AND vote_round = v_round
    GROUP BY option
    ORDER BY cnt DESC, option ASC
    LIMIT 1
  ) t;

  SELECT COUNT(*) INTO v_options_at_max
  FROM (
    SELECT option, COUNT(*) AS cnt
    FROM public.tie_break_votes
    WHERE session_id = v_session.id
      AND vote_round = v_round
    GROUP BY option
  ) c
  WHERE c.cnt = v_max_count;

  IF v_options_at_max = 1 THEN
    UPDATE public.tie_break_sessions
    SET selected_resolution = v_winner_option,
        resolved_by_majority = true,
        status = CASE WHEN v_winner_option = 'random_number' THEN 'random_pending' ELSE 'resolved' END,
        resolution_payload = jsonb_build_object(
          'decisionRound', v_round,
          'majorityOption', v_winner_option,
          'voteCount', v_max_count
        )
    WHERE id = v_session.id;

    IF v_winner_option = 'split_prize' THEN
      SELECT *
        INTO v_match
      FROM public.partidas
      WHERE id = v_session.match_id
      FOR UPDATE;

      SELECT ARRAY_AGG(player_id), COUNT(*)
        INTO v_participant_ids, v_participant_count
      FROM public.tie_break_participants
      WHERE session_id = v_session.id;

      v_safe_pot := COALESCE(v_match.pot, 0);
      v_prize_value := COALESCE((v_match.prize->>'value')::numeric, 0);

      IF v_match.prize->>'type' = 'fixed' THEN
        v_total_prize_pool := v_prize_value;
      ELSIF v_match.prize->>'type' = 'percentage' THEN
        v_total_prize_pool := (v_safe_pot * v_prize_value) / 100;
      ELSE
        v_total_prize_pool := 0;
      END IF;

      IF v_participant_count > 0 THEN
        v_split_each := v_total_prize_pool / v_participant_count;
      END IF;

      IF v_split_each > 0 AND v_participant_ids IS NOT NULL THEN
        FOREACH v_player_id IN ARRAY v_participant_ids LOOP
          PERFORM public.increment_player_credits(
            p_player_id => v_player_id,
            p_amount => v_split_each
          );
        END LOOP;
      END IF;

      UPDATE public.tie_break_sessions
      SET resolution_payload = COALESCE(resolution_payload, '{}'::jsonb) || jsonb_build_object(
        'payoutApplied', true,
        'paidAmount', v_total_prize_pool,
        'splitPerPlayer', v_split_each,
        'splitPlayerCount', v_participant_count
      )
      WHERE id = v_session.id;

      UPDATE public.partidas
      SET status = 'finished',
          tie_break_status = 'resolved',
          is_auto_calling = false,
          next_auto_call_timestamp = null
      WHERE id = v_session.match_id;
    ELSIF v_winner_option = 'rematch' THEN
      SELECT *
        INTO v_match
      FROM public.partidas
      WHERE id = v_session.match_id
      FOR UPDATE;

      SELECT COUNT(*)
        INTO v_participant_count
      FROM public.tie_break_participants
      WHERE session_id = v_session.id;

      INSERT INTO public.partidas (
        name,
        game_type,
        max_cards_per_player,
        card_price,
        prize,
        start_time,
        status,
        called_numbers,
        pot,
        winners,
        is_auto_calling,
        next_auto_call_timestamp,
        min_players,
        admin_id,
        is_festival,
        prizes,
        current_round,
        completed_rounds,
        tie_break_status,
        tie_break_session_id
      )
      VALUES (
        COALESCE(v_match.name, 'Partida') || ' - Rematch',
        v_match.game_type,
        GREATEST(1, COALESCE(v_participant_count, 1)),
        0,
        v_match.prize,
        timezone('utc'::text, now()),
        'in_progress',
        '{}'::integer[],
        v_match.pot,
        '[]'::jsonb,
        false,
        null,
        GREATEST(1, COALESCE(v_participant_count, 1)),
        v_match.admin_id,
        false,
        '[]'::jsonb,
        0,
        '[]'::jsonb,
        'none',
        null
      )
      RETURNING id INTO v_new_match_id;

      INSERT INTO public.cartelas_partida (
        player_card_id,
        player_id,
        match_id,
        name,
        numbers,
        marked_numbers
      )
      SELECT
        cp.player_card_id,
        cp.player_id,
        v_new_match_id,
        cp.name,
        cp.numbers,
        '{}'::integer[]
      FROM public.cartelas_partida cp
      JOIN (
        SELECT DISTINCT (w->>'cardId')::uuid AS card_id
        FROM jsonb_array_elements(COALESCE(v_match.winners, '[]'::jsonb)) AS w
        WHERE COALESCE(w->>'creditType', 'real') = 'real'
      ) tied_cards
        ON tied_cards.card_id = cp.id
      WHERE cp.match_id = v_match.id;

      UPDATE public.tie_break_sessions
      SET resolution_payload = COALESCE(resolution_payload, '{}'::jsonb) || jsonb_build_object(
        'rematchMatchId', v_new_match_id
      )
      WHERE id = v_session.id;

      UPDATE public.partidas
      SET status = 'finished',
          tie_break_status = 'resolved',
          is_auto_calling = false,
          next_auto_call_timestamp = null
      WHERE id = v_session.match_id;
    ELSIF v_winner_option <> 'random_number' THEN
      UPDATE public.partidas
      SET tie_break_status = 'resolved'
      WHERE id = v_session.match_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'round', v_round,
      'consensusReached', true,
      'selectedResolution', v_winner_option,
      'voteCount', v_max_count,
      'rematchMatchId', v_new_match_id,
      'splitPerPlayer', v_split_each
    );
  END IF;

  UPDATE public.tie_break_sessions
  SET current_vote_round = current_vote_round + 1,
      status = 'voting',
      selected_resolution = NULL,
      resolved_by_majority = false
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'round', v_round,
    'consensusReached', false,
    'needsRevote', true,
    'message', 'Nao houve consenso. Escolham novamente.'
  );
END;
$$;


ALTER FUNCTION "public"."submit_tie_break_vote"("p_session_id" "uuid", "p_option" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_bloqueado_admin"("p_admin_id" "uuid", "p_bloqueado" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'dev') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE perfis SET bloqueado = p_bloqueado WHERE id = p_admin_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."toggle_bloqueado_admin"("p_admin_id" "uuid", "p_bloqueado" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_bloqueado_jogador"("p_player_id" "uuid", "p_bloqueado" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role IN ('admin', 'dev')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE perfis SET bloqueado = p_bloqueado WHERE id = p_player_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."toggle_bloqueado_jogador"("p_player_id" "uuid", "p_bloqueado" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_manual_mark"("p_card_id" "uuid", "p_num" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_card public.cartelas_partida;
    v_is_marked boolean;
BEGIN
    SELECT * INTO v_card FROM public.cartelas_partida WHERE id = p_card_id AND player_id = auth.uid();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'card_not_found_or_unauthorized');
    END IF;

    IF v_card.marking_mode != 'manual' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_in_manual_mode');
    END IF;

    v_is_marked := (p_num = ANY(COALESCE(v_card.marked_numbers, '{}'::int[])));

    IF v_is_marked THEN
        UPDATE public.cartelas_partida SET marked_numbers = array_remove(marked_numbers, p_num) WHERE id = p_card_id;
    ELSE
        UPDATE public.cartelas_partida SET marked_numbers = array_append(COALESCE(v_card.marked_numbers, '{}'::int[]), p_num) WHERE id = p_card_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."toggle_manual_mark"("p_card_id" "uuid", "p_num" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_tie_break_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_tie_break_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_lock_match"("p_match_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  got_lock boolean;
begin
  -- O lock é liberado automaticamente no final da transação.
  select pg_try_advisory_xact_lock(hashtext(p_match_id::text)) into got_lock;
  return got_lock;
end;
$$;


ALTER FUNCTION "public"."try_lock_match"("p_match_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."update_game_settings"("p_settings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_live_stream_settings"("p_settings" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Garante linha de configuração para o admin atual
  IF NOT EXISTS (SELECT 1 FROM public.configuracoes WHERE admin_id = auth.uid()) THEN
    INSERT INTO public.configuracoes (admin_id, singleton)
    VALUES (auth.uid(), false);
  END IF;

  UPDATE public.configuracoes SET
    live_external_enabled      = CASE WHEN p_settings ? 'live_external_enabled' THEN (p_settings->>'live_external_enabled')::BOOLEAN ELSE live_external_enabled END,
    live_external_provider     = CASE WHEN p_settings ? 'live_external_provider' THEN COALESCE(p_settings->>'live_external_provider', live_external_provider) ELSE live_external_provider END,
    live_external_rtmp_url     = CASE WHEN p_settings ? 'live_external_rtmp_url' THEN COALESCE(p_settings->>'live_external_rtmp_url', live_external_rtmp_url) ELSE live_external_rtmp_url END,
    live_external_stream_key   = CASE WHEN p_settings ? 'live_external_stream_key' THEN COALESCE(p_settings->>'live_external_stream_key', live_external_stream_key) ELSE live_external_stream_key END,
    live_external_youtube_url  = CASE WHEN p_settings ? 'live_external_youtube_url' THEN COALESCE(p_settings->>'live_external_youtube_url', live_external_youtube_url) ELSE live_external_youtube_url END,
    live_external_facebook_url = CASE WHEN p_settings ? 'live_external_facebook_url' THEN COALESCE(p_settings->>'live_external_facebook_url', live_external_facebook_url) ELSE live_external_facebook_url END
  WHERE admin_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."update_live_stream_settings"("p_settings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_cartela_publica"("p_codigo" "text", "p_nome" "text", "p_telefone" "text" DEFAULT NULL::"text", "p_endereco" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_venda_bingo record;
  v_cartela_rifa record;
BEGIN
  -- 1. Tenta achar no Bingo Físico
  SELECT * INTO v_venda_bingo FROM vendas_bingo_fisico WHERE upper(codigo_validacao) = upper(p_codigo);
  
  IF FOUND THEN
    IF v_venda_bingo.nome_comprador IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cartela já validada anteriormente.');
    END IF;

    IF v_venda_bingo.status != 'pago' THEN
      RETURN jsonb_build_object('success', false, 'error', 'A cartela precisa ser paga antes de validar os dados.');
    END IF;

    -- Atualiza os dados da folha de bingo
    UPDATE vendas_bingo_fisico 
    SET nome_comprador = p_nome, telefone_comprador = p_telefone, endereco_comprador = p_endereco 
    WHERE id = v_venda_bingo.id;

    RETURN jsonb_build_object('success', true);
  END IF;

  -- 2. Tenta achar na Rifa
  SELECT cr.*, c.status as compra_status, c.vendedor_id, c.valor_total, c.desconto_aplicado, c.numeros, c.rifa_id, n.id as numero_id, n.nome_comprador
  INTO v_cartela_rifa
  FROM cartelas_rifa cr
  JOIN compras_rifa c ON c.id = cr.compra_id
  JOIN numeros_rifa n ON n.id = cr.numero_rifa_id
  WHERE upper(cr.codigo_validacao) = upper(p_codigo);

  IF FOUND THEN
    IF v_cartela_rifa.nome_comprador IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Bilhete já validado anteriormente.');
    END IF;

    IF v_cartela_rifa.compra_status != 'pago' THEN
      RETURN jsonb_build_object('success', false, 'error', 'A cartela precisa ser paga antes de validar os dados.');
    END IF;

    -- Atualiza os dados no numero da rifa e passa para VENDIDO
    UPDATE numeros_rifa 
    SET nome_comprador = p_nome, 
        telefone_comprador = p_telefone, 
        endereco_comprador = p_endereco,
        status = 'vendido'
    WHERE id = v_cartela_rifa.numero_id;

    RETURN jsonb_build_object('success', true);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Código de validação não encontrado.');
END;
$$;


ALTER FUNCTION "public"."validar_cartela_publica"("p_codigo" "text", "p_nome" "text", "p_telefone" "text", "p_endereco" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_venda_vendedor"("p_numero_rifa_id" "uuid", "p_nome_comprador" "text", "p_telefone_comprador" "text" DEFAULT NULL::"text", "p_endereco_comprador" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_vendedor_id UUID;
  v_numero numeros_rifa%ROWTYPE;
  v_rifa rifas%ROWTYPE;
  v_cfg configuracoes%ROWTYPE;
  v_comissao NUMERIC;
  v_comissao_valor NUMERIC;
BEGIN
  SELECT id INTO v_vendedor_id FROM vendedores_rifa WHERE user_id = v_user_id AND ativo = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_vendor');
  END IF;

  SELECT * INTO v_numero FROM numeros_rifa
  WHERE id = p_numero_rifa_id AND vendedor_id = v_vendedor_id AND status = 'reservado';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'numero_not_found');
  END IF;

  SELECT * INTO v_rifa FROM rifas WHERE id = v_numero.rifa_id;
  SELECT * INTO v_cfg FROM configuracoes LIMIT 1;

  UPDATE numeros_rifa
  SET status = 'vendido',
      nome_comprador = p_nome_comprador,
      telefone_comprador = p_telefone_comprador,
      endereco_comprador = p_endereco_comprador
  WHERE id = p_numero_rifa_id;

  SELECT vr.comissao_percentual INTO v_comissao
  FROM vendedores_rifa vr WHERE vr.id = v_vendedor_id;

  IF v_comissao IS NULL OR v_comissao = 0 THEN
    v_comissao := COALESCE(v_cfg.comissao_vendedor_global, 0);
  END IF;

  IF v_comissao > 0 THEN
    v_comissao_valor := v_rifa.custo_por_numero * (v_comissao / 100.0);
    UPDATE perfis SET credits = credits + v_comissao_valor WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'comissao_creditada', COALESCE(v_comissao_valor, 0));
END;
$$;


ALTER FUNCTION "public"."validar_venda_vendedor"("p_numero_rifa_id" "uuid", "p_nome_comprador" "text", "p_telefone_comprador" "text", "p_endereco_comprador" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."withdraw_admin_profit"("amount_to_withdraw" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF public.is_admin() THEN
    UPDATE public.configuracoes
    SET admin_profit = admin_profit - amount_to_withdraw
    WHERE admin_id = auth.uid() AND admin_profit >= amount_to_withdraw;
  END IF;
END;
$$;


ALTER FUNCTION "public"."withdraw_admin_profit"("amount_to_withdraw" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."acertos_vendedor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendedor_id" "uuid",
    "valor" numeric NOT NULL,
    "comprovante_url" "text",
    "status" "text" DEFAULT 'pendente'::"text",
    "bingo_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "rifa_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "repasse_concluido" boolean DEFAULT false,
    "comissao_paga" numeric DEFAULT 0,
    "admin_id" "uuid"
);


ALTER TABLE "public"."acertos_vendedor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_modulos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "modulo_bingo" boolean DEFAULT true NOT NULL,
    "modulo_rifa" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_modulos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "credits" integer DEFAULT 100 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "bloqueado" boolean,
    "fake_credits" numeric DEFAULT 0,
    "cpf" "text",
    "whatsapp" "text",
    "address" "text"
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


COMMENT ON TABLE "public"."admins" IS 'This is a duplicate of perfis';



CREATE TABLE IF NOT EXISTS "public"."cadastro_vendedor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "nome_completo" "text" NOT NULL,
    "telefone" "text",
    "endereco" "text",
    "cpf" "text",
    "rg" "text",
    "foto_url" "text",
    "documento_url" "text",
    "comprovante_endereco_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "admin_id" "uuid"
);


ALTER TABLE "public"."cadastro_vendedor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cartelas_jogador" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "numbers" "jsonb" NOT NULL,
    "uses_left" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "credit_type" "text" DEFAULT 'real'::"text",
    "admin_id" "uuid",
    "vendedor_id" "uuid"
);


ALTER TABLE "public"."cartelas_jogador" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cartelas_partida" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_card_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "match_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "numbers" "jsonb" NOT NULL,
    "marked_numbers" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "credit_type" "text" DEFAULT 'real'::"text",
    "marking_mode" "text" DEFAULT 'auto'::"text",
    "admin_id" "uuid",
    "vendedor_id" "uuid"
);


ALTER TABLE "public"."cartelas_partida" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cartelas_rifa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero_rifa_id" "uuid" NOT NULL,
    "compra_id" "uuid" NOT NULL,
    "codigo_validacao" "text" DEFAULT "upper"("substr"("md5"(("random"())::"text"), 1, 10)) NOT NULL,
    "qr_code_data" "text",
    "impresso" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "admin_id" "uuid",
    "vendedor_id" "uuid" DEFAULT "gen_random_uuid"()
);


ALTER TABLE "public"."cartelas_rifa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes_rifa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "telefone" "text",
    "endereco" "text",
    "vendedor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "admin_id" "uuid"
);


ALTER TABLE "public"."clientes_rifa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compras_rifa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rifa_id" "uuid" NOT NULL,
    "comprador_id" "uuid",
    "vendedor_id" "uuid",
    "cliente_rifa_id" "uuid",
    "numeros" integer[] NOT NULL,
    "valor_total" numeric NOT NULL,
    "desconto_aplicado" numeric DEFAULT 0,
    "tipo_pagamento" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ref_vendedor_id" "uuid",
    "status" "text" DEFAULT 'pago'::"text",
    "comprovante_url" "text",
    "admin_id" "uuid",
    CONSTRAINT "compras_rifa_tipo_pagamento_check" CHECK (("tipo_pagamento" = ANY (ARRAY['creditos'::"text", 'vendedor'::"text"])))
);


ALTER TABLE "public"."compras_rifa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configuracoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "singleton" boolean DEFAULT true NOT NULL,
    "custo_nova_cartela" numeric(10,2) DEFAULT 10.00 NOT NULL,
    "custo_recarga_cartela" numeric(10,2) DEFAULT 5.00 NOT NULL,
    "usos_por_recarga" integer DEFAULT 1 NOT NULL,
    "intervalo_sorteio_auto_seg" integer DEFAULT 120 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pix_key" "text",
    "credit_request_text" "text",
    "n8n_test_url" "text",
    "n8n_prod_url" "text",
    "n8n_env" "text" DEFAULT 'test'::"text",
    "valor_por_credito" numeric DEFAULT 1.0,
    "admin_profit" numeric DEFAULT 0.00 NOT NULL,
    "auto_engine_enabled" boolean DEFAULT false,
    "auto_engine_interval_mins" integer DEFAULT 60,
    "auto_engine_matches_per_day" integer DEFAULT 24,
    "auto_engine_game_type" "text" DEFAULT 'full'::"text",
    "auto_engine_card_price" numeric DEFAULT 10,
    "auto_engine_prize_type" "text" DEFAULT 'percentage'::"text",
    "auto_engine_prize_value" numeric DEFAULT 80,
    "auto_engine_start_hour" integer DEFAULT 0,
    "desconto_vendedor_global" numeric DEFAULT 0,
    "comissao_vendedor_global" numeric DEFAULT 0,
    "cartelas_por_folha_bingo" integer DEFAULT 4,
    "pix_name" "text" DEFAULT 'BINGO SHOW'::"text",
    "pix_city" "text" DEFAULT 'SAO PAULO'::"text",
    "stripe_secret_key" "text",
    "stripe_webhook_secret" "text",
    "stripe_enabled" boolean DEFAULT false,
    "stripe_pass_fees_to_customer" boolean DEFAULT false,
    "stripe_fee_percentage" numeric DEFAULT 3.99,
    "stripe_fee_fixed" numeric DEFAULT 0.39,
    "admin_id" "uuid",
    "auto_engine_max_cards" integer DEFAULT 3,
    "stripe_env" "text" DEFAULT 'test'::"text",
    "stripe_secret_key_test" "text",
    "stripe_webhook_secret_test" "text",
    "pagbank_enabled" boolean DEFAULT false,
    "pagbank_env" "text" DEFAULT 'sandbox'::"text",
    "pagbank_token_sandbox" "text",
    "pagbank_token_producao" "text",
    "pagbank_pass_fees_to_customer" boolean DEFAULT false,
    "pagbank_pix_fee_fixed" numeric DEFAULT 0.99,
    "pagbank_pix_fee_percentage" numeric DEFAULT 0,
    "pagbank_card_fee_fixed" numeric DEFAULT 0.39,
    "pagbank_card_fee_percentage" numeric DEFAULT 4.99,
    "live_external_enabled" boolean DEFAULT false,
    "live_external_provider" "text" DEFAULT 'manual'::"text",
    "live_external_rtmp_url" "text",
    "live_external_stream_key" "text",
    "live_external_youtube_url" "text",
    "live_external_facebook_url" "text",
    CONSTRAINT "configuracoes_n8n_env_check" CHECK (("n8n_env" = ANY (ARRAY['test'::"text", 'production'::"text"])))
);


ALTER TABLE "public"."configuracoes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."configuracoes"."auto_engine_enabled" IS 'Liga ou desliga o motor de criação automática de partidas';



COMMENT ON COLUMN "public"."configuracoes"."auto_engine_interval_mins" IS 'Intervalo em minutos entre a criação de cada partida';



COMMENT ON COLUMN "public"."configuracoes"."auto_engine_matches_per_day" IS 'Limite máximo de partidas criadas automaticamente por dia';



CREATE TABLE IF NOT EXISTS "public"."match_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "match_comments_message_max_len" CHECK (("length"("message") <= 300)),
    CONSTRAINT "match_comments_message_not_empty" CHECK (("length"("btrim"("message")) > 0))
);

ALTER TABLE ONLY "public"."match_comments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."match_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mensagens_resgate" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "redeem_request_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_id" "uuid"
);


ALTER TABLE "public"."mensagens_resgate" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mensagens_solicitacao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "credit_request_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."mensagens_solicitacao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."numeros_rifa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rifa_id" "uuid" NOT NULL,
    "numero" integer NOT NULL,
    "status" "text" DEFAULT 'disponivel'::"text" NOT NULL,
    "comprador_id" "uuid",
    "vendedor_id" "uuid",
    "cliente_rifa_id" "uuid",
    "reservado_ate" timestamp with time zone,
    "nome_comprador" "text",
    "telefone_comprador" "text",
    "endereco_comprador" "text",
    "admin_id" "uuid",
    CONSTRAINT "numeros_rifa_status_check" CHECK (("status" = ANY (ARRAY['disponivel'::"text", 'reservado'::"text", 'vendido'::"text"])))
);


ALTER TABLE "public"."numeros_rifa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pagbank_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "reference_id" "text" NOT NULL,
    "pagbank_order_id" "text",
    "amount" numeric NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "payment_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "admin_id" "uuid"
);


ALTER TABLE "public"."pagbank_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partidas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "game_type" "text" NOT NULL,
    "max_cards_per_player" integer DEFAULT 3 NOT NULL,
    "card_price" numeric DEFAULT 10 NOT NULL,
    "prize" "jsonb" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "status" "public"."match_status" DEFAULT 'waiting'::"public"."match_status" NOT NULL,
    "called_numbers" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "pot" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "is_auto_calling" boolean DEFAULT false,
    "next_auto_call_timestamp" timestamp with time zone,
    "winners" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "min_players" integer DEFAULT 1 NOT NULL,
    "prize_image_url" "text",
    "is_festival" boolean DEFAULT false,
    "prizes" "jsonb" DEFAULT '[]'::"jsonb",
    "current_round" integer DEFAULT 0,
    "completed_rounds" "jsonb" DEFAULT '[]'::"jsonb",
    "admin_id" "uuid",
    "tie_break_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "tie_break_session_id" "uuid",
    CONSTRAINT "partidas_card_price_non_negative" CHECK (("card_price" >= (0)::numeric)),
    CONSTRAINT "partidas_tie_break_status_check" CHECK (("tie_break_status" = ANY (ARRAY['none'::"text", 'pending'::"text", 'resolved'::"text"])))
);

ALTER TABLE ONLY "public"."partidas" REPLICA IDENTITY FULL;


ALTER TABLE "public"."partidas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos_planos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plano_id" "uuid",
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "telefone" "text",
    "mensagem" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "admin_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pedidos_planos_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'ativo'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."pedidos_planos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfis" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "credits" numeric(10,2) DEFAULT 100 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "bloqueado" boolean,
    "fake_credits" numeric DEFAULT 0,
    "cpf" "text",
    "whatsapp" "text",
    "address" "text",
    "admins_id" "uuid" DEFAULT "gen_random_uuid"(),
    "vendedor_id" "uuid"
);


ALTER TABLE "public"."perfis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "preco" numeric DEFAULT 0 NOT NULL,
    "modulo_bingo" boolean DEFAULT true NOT NULL,
    "modulo_rifa" boolean DEFAULT true NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "destaque" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "admin_id" "uuid" DEFAULT "gen_random_uuid"()
);


ALTER TABLE "public"."planos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rifas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "regulamento" "text",
    "fotos" "jsonb" DEFAULT '[]'::"jsonb",
    "foto_capa" "text",
    "quantidade_numeros" integer NOT NULL,
    "numero_inicial" integer DEFAULT 1 NOT NULL,
    "custo_por_numero" numeric DEFAULT 1 NOT NULL,
    "data_inicio" timestamp with time zone,
    "data_encerramento" timestamp with time zone,
    "status" "text" DEFAULT 'ativa'::"text" NOT NULL,
    "numero_ganhador" integer,
    "ganhador_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "premio_fotos" "jsonb" DEFAULT '[]'::"jsonb",
    "preco_vendedor" numeric,
    "premio_descricao" "text",
    "custo_premio" numeric DEFAULT 0,
    "ganhador_confirmou" boolean DEFAULT false,
    "admin_id" "uuid",
    CONSTRAINT "rifas_status_check" CHECK (("status" = ANY (ARRAY['ativa'::"text", 'finalizada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."rifas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."solicitacoes_credito" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "public"."credit_request_status" DEFAULT 'pending'::"public"."credit_request_status" NOT NULL,
    "receipt_url" "text" NOT NULL,
    "credits_granted" numeric,
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "notes" "text",
    "credits_requested" numeric,
    "amount_paid" numeric,
    "resubmission_notes" "text",
    "repasse_concluido" boolean DEFAULT false,
    "admin_id" "uuid"
);


ALTER TABLE "public"."solicitacoes_credito" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."solicitacoes_resgate" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "public"."credit_request_status" DEFAULT 'pending'::"public"."credit_request_status" NOT NULL,
    "credits_requested" numeric NOT NULL,
    "amount_to_receive" numeric NOT NULL,
    "receipt_url" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "notes" "text",
    "resubmission_notes" "text",
    "admin_id" "uuid",
    "admins_id" "uuid" DEFAULT "gen_random_uuid"()
);


ALTER TABLE "public"."solicitacoes_resgate" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."solicitacoes_vendedor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "nome" "text" NOT NULL,
    "documento" "text",
    "telefone" "text",
    "endereco" "text",
    "mensagem" "text",
    "mensagem_admin" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "admin_id" "uuid",
    CONSTRAINT "solicitacoes_vendedor_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text"])))
);


ALTER TABLE "public"."solicitacoes_vendedor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "stripe_session_id" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'brl'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "payment_type" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "admin_id" "uuid" DEFAULT "gen_random_uuid"()
);


ALTER TABLE "public"."stripe_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tie_break_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "is_active_random" boolean DEFAULT true NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."tie_break_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tie_break_random_numbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "random_round" integer NOT NULL,
    "player_id" "uuid" NOT NULL,
    "generated_number" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."tie_break_random_numbers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tie_break_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "admin_id" "uuid",
    "status" "text" DEFAULT 'voting'::"text" NOT NULL,
    "current_vote_round" integer DEFAULT 1 NOT NULL,
    "current_random_round" integer DEFAULT 1 NOT NULL,
    "allowed_options" "text"[] DEFAULT ARRAY['random_number'::"text", 'rematch'::"text", 'split_prize'::"text"] NOT NULL,
    "split_allowed" boolean DEFAULT true NOT NULL,
    "selected_resolution" "text",
    "resolved_by_majority" boolean DEFAULT false NOT NULL,
    "winner_player_id" "uuid",
    "resolution_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "tie_break_sessions_selected_resolution_check" CHECK (("selected_resolution" = ANY (ARRAY['random_number'::"text", 'rematch'::"text", 'split_prize'::"text"]))),
    CONSTRAINT "tie_break_sessions_status_check" CHECK (("status" = ANY (ARRAY['voting'::"text", 'random_pending'::"text", 'resolved'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."tie_break_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tie_break_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "vote_round" integer NOT NULL,
    "player_id" "uuid" NOT NULL,
    "option" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "tie_break_votes_option_check" CHECK (("option" = ANY (ARRAY['random_number'::"text", 'rematch'::"text", 'split_prize'::"text"])))
);


ALTER TABLE "public"."tie_break_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendas_bingo_fisico" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid",
    "vendedor_id" "uuid",
    "codigo_validacao" "text" NOT NULL,
    "grids" "jsonb" NOT NULL,
    "valor_pago" numeric NOT NULL,
    "desconto_aplicado" numeric NOT NULL,
    "nome_comprador" "text",
    "telefone_comprador" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pago'::"text",
    "endereco_comprador" "text",
    "comprovante_url" "text",
    "admin_id" "uuid"
);


ALTER TABLE "public"."vendas_bingo_fisico" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendedores_rifa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "nome" "text" NOT NULL,
    "documento" "text",
    "telefone" "text",
    "percentual_desconto" numeric DEFAULT 0,
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "codigo_ref" "text" DEFAULT "upper"("substr"("md5"(("random"())::"text"), 1, 8)),
    "comissao_percentual" numeric DEFAULT 0,
    "admin_id" "uuid"
);


ALTER TABLE "public"."vendedores_rifa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vitorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "player_card_id" "uuid",
    "match_card_id" "uuid" NOT NULL,
    "prize_details" "jsonb" NOT NULL,
    "won_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "admin_id" "uuid"
);


ALTER TABLE "public"."vitorias" OWNER TO "postgres";


COMMENT ON TABLE "public"."vitorias" IS 'Registra cada vitória de um jogador em uma partida.';



COMMENT ON COLUMN "public"."vitorias"."match_id" IS 'ID da partida em que a vitória ocorreu.';



COMMENT ON COLUMN "public"."vitorias"."player_id" IS 'ID do jogador que venceu.';



COMMENT ON COLUMN "public"."vitorias"."player_card_id" IS 'ID da cartela do jogador (o template) que venceu.';



COMMENT ON COLUMN "public"."vitorias"."match_card_id" IS 'ID da cartela da partida (a instância) que venceu.';



COMMENT ON COLUMN "public"."vitorias"."prize_details" IS 'Detalhes do prêmio no momento da vitória.';



COMMENT ON COLUMN "public"."vitorias"."won_at" IS 'Timestamp de quando a vitória foi registrada.';



ALTER TABLE ONLY "public"."acertos_vendedor"
    ADD CONSTRAINT "acertos_vendedor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_modulos"
    ADD CONSTRAINT "admin_modulos_admin_id_key" UNIQUE ("admin_id");



ALTER TABLE ONLY "public"."admin_modulos"
    ADD CONSTRAINT "admin_modulos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cadastro_vendedor"
    ADD CONSTRAINT "cadastro_vendedor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cadastro_vendedor"
    ADD CONSTRAINT "cadastro_vendedor_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."cartelas_jogador"
    ADD CONSTRAINT "cartelas_jogador_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cartelas_partida"
    ADD CONSTRAINT "cartelas_partida_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cartelas_rifa"
    ADD CONSTRAINT "cartelas_rifa_codigo_validacao_key" UNIQUE ("codigo_validacao");



ALTER TABLE ONLY "public"."cartelas_rifa"
    ADD CONSTRAINT "cartelas_rifa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes_rifa"
    ADD CONSTRAINT "clientes_rifa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compras_rifa"
    ADD CONSTRAINT "compras_rifa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracoes"
    ADD CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracoes"
    ADD CONSTRAINT "configuracoes_singleton_key" UNIQUE ("singleton");



ALTER TABLE ONLY "public"."match_comments"
    ADD CONSTRAINT "match_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mensagens_resgate"
    ADD CONSTRAINT "mensagens_resgate_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mensagens_solicitacao"
    ADD CONSTRAINT "mensagens_solicitacao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."numeros_rifa"
    ADD CONSTRAINT "numeros_rifa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."numeros_rifa"
    ADD CONSTRAINT "numeros_rifa_rifa_id_numero_key" UNIQUE ("rifa_id", "numero");



ALTER TABLE ONLY "public"."pagbank_payments"
    ADD CONSTRAINT "pagbank_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partidas"
    ADD CONSTRAINT "partidas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_planos"
    ADD CONSTRAINT "pedidos_planos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_cpf_key" UNIQUE ("cpf");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_whatsapp_key" UNIQUE ("whatsapp");



ALTER TABLE ONLY "public"."planos"
    ADD CONSTRAINT "planos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rifas"
    ADD CONSTRAINT "rifas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solicitacoes_credito"
    ADD CONSTRAINT "solicitacoes_credito_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solicitacoes_resgate"
    ADD CONSTRAINT "solicitacoes_resgate_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solicitacoes_vendedor"
    ADD CONSTRAINT "solicitacoes_vendedor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_payments"
    ADD CONSTRAINT "stripe_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_payments"
    ADD CONSTRAINT "stripe_payments_stripe_session_id_key" UNIQUE ("stripe_session_id");



ALTER TABLE ONLY "public"."tie_break_participants"
    ADD CONSTRAINT "tie_break_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tie_break_participants"
    ADD CONSTRAINT "tie_break_participants_session_id_player_id_key" UNIQUE ("session_id", "player_id");



ALTER TABLE ONLY "public"."tie_break_random_numbers"
    ADD CONSTRAINT "tie_break_random_numbers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tie_break_random_numbers"
    ADD CONSTRAINT "tie_break_random_numbers_session_id_random_round_player_id_key" UNIQUE ("session_id", "random_round", "player_id");



ALTER TABLE ONLY "public"."tie_break_sessions"
    ADD CONSTRAINT "tie_break_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tie_break_votes"
    ADD CONSTRAINT "tie_break_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tie_break_votes"
    ADD CONSTRAINT "tie_break_votes_session_id_vote_round_player_id_key" UNIQUE ("session_id", "vote_round", "player_id");



ALTER TABLE ONLY "public"."vendas_bingo_fisico"
    ADD CONSTRAINT "vendas_bingo_fisico_codigo_validacao_key" UNIQUE ("codigo_validacao");



ALTER TABLE ONLY "public"."vendas_bingo_fisico"
    ADD CONSTRAINT "vendas_bingo_fisico_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendedores_rifa"
    ADD CONSTRAINT "vendedores_rifa_codigo_ref_key" UNIQUE ("codigo_ref");



ALTER TABLE ONLY "public"."vendedores_rifa"
    ADD CONSTRAINT "vendedores_rifa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendedores_rifa"
    ADD CONSTRAINT "vendedores_rifa_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."vitorias"
    ADD CONSTRAINT "vitorias_match_card_unique" UNIQUE ("match_id", "match_card_id");



ALTER TABLE ONLY "public"."vitorias"
    ADD CONSTRAINT "vitorias_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_match_comments_match_id_created_at" ON "public"."match_comments" USING "btree" ("match_id", "created_at" DESC);



CREATE INDEX "idx_match_comments_sender_id" ON "public"."match_comments" USING "btree" ("sender_id");



CREATE INDEX "idx_tie_break_participants_session_id" ON "public"."tie_break_participants" USING "btree" ("session_id");



CREATE INDEX "idx_tie_break_random_session_round" ON "public"."tie_break_random_numbers" USING "btree" ("session_id", "random_round");



CREATE INDEX "idx_tie_break_sessions_match_id" ON "public"."tie_break_sessions" USING "btree" ("match_id");



CREATE INDEX "idx_tie_break_votes_session_round" ON "public"."tie_break_votes" USING "btree" ("session_id", "vote_round");



CREATE UNIQUE INDEX "ux_tie_break_active_session_per_match" ON "public"."tie_break_sessions" USING "btree" ("match_id") WHERE ("status" = ANY (ARRAY['voting'::"text", 'random_pending'::"text"]));



CREATE OR REPLACE TRIGGER "trg_cartelas_jogador_admin" BEFORE INSERT ON "public"."cartelas_jogador" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_player"();



CREATE OR REPLACE TRIGGER "trg_cartelas_partida_admin" BEFORE INSERT ON "public"."cartelas_partida" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_match"();



CREATE OR REPLACE TRIGGER "trg_compras_rifa_admin" BEFORE INSERT ON "public"."compras_rifa" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_rifa"();



CREATE OR REPLACE TRIGGER "trg_mensagens_resgate_admin" BEFORE INSERT ON "public"."mensagens_resgate" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_redeem_request"();



CREATE OR REPLACE TRIGGER "trg_numeros_rifa_admin" BEFORE INSERT ON "public"."numeros_rifa" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_rifa"();



CREATE OR REPLACE TRIGGER "trg_pagbank_payments_admin" BEFORE INSERT ON "public"."pagbank_payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_auth_pagbank"();



CREATE OR REPLACE TRIGGER "trg_partidas_admin" BEFORE INSERT ON "public"."partidas" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_rifas_admin" BEFORE INSERT ON "public"."rifas" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_solic_credito_admin" BEFORE INSERT ON "public"."solicitacoes_credito" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_player"();



CREATE OR REPLACE TRIGGER "trg_solic_resgate_admin" BEFORE INSERT ON "public"."solicitacoes_resgate" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_player"();



CREATE OR REPLACE TRIGGER "trg_solic_vendedor_admin" BEFORE INSERT ON "public"."solicitacoes_vendedor" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_player"();



CREATE OR REPLACE TRIGGER "trg_touch_tie_break_random_numbers_updated_at" BEFORE UPDATE ON "public"."tie_break_random_numbers" FOR EACH ROW EXECUTE FUNCTION "public"."touch_tie_break_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_tie_break_sessions_updated_at" BEFORE UPDATE ON "public"."tie_break_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_tie_break_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_tie_break_votes_updated_at" BEFORE UPDATE ON "public"."tie_break_votes" FOR EACH ROW EXECUTE FUNCTION "public"."touch_tie_break_updated_at"();



CREATE OR REPLACE TRIGGER "trg_vendas_bingo_admin" BEFORE INSERT ON "public"."vendas_bingo_fisico" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_match"();



CREATE OR REPLACE TRIGGER "trg_vendedores_admin" BEFORE INSERT ON "public"."vendedores_rifa" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_id_from_auth"();



ALTER TABLE ONLY "public"."acertos_vendedor"
    ADD CONSTRAINT "acertos_vendedor_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acertos_vendedor"
    ADD CONSTRAINT "acertos_vendedor_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores_rifa"("id");



ALTER TABLE ONLY "public"."cadastro_vendedor"
    ADD CONSTRAINT "cadastro_vendedor_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cadastro_vendedor"
    ADD CONSTRAINT "cadastro_vendedor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cartelas_jogador"
    ADD CONSTRAINT "cartelas_jogador_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cartelas_jogador"
    ADD CONSTRAINT "cartelas_jogador_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cartelas_jogador"
    ADD CONSTRAINT "cartelas_jogador_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores_rifa"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cartelas_partida"
    ADD CONSTRAINT "cartelas_partida_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cartelas_partida"
    ADD CONSTRAINT "cartelas_partida_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."partidas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cartelas_partida"
    ADD CONSTRAINT "cartelas_partida_player_card_id_fkey" FOREIGN KEY ("player_card_id") REFERENCES "public"."cartelas_jogador"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cartelas_partida"
    ADD CONSTRAINT "cartelas_partida_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cartelas_partida"
    ADD CONSTRAINT "cartelas_partida_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores_rifa"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cartelas_rifa"
    ADD CONSTRAINT "cartelas_rifa_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cartelas_rifa"
    ADD CONSTRAINT "cartelas_rifa_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "public"."compras_rifa"("id");



ALTER TABLE ONLY "public"."cartelas_rifa"
    ADD CONSTRAINT "cartelas_rifa_numero_rifa_id_fkey" FOREIGN KEY ("numero_rifa_id") REFERENCES "public"."numeros_rifa"("id");



ALTER TABLE ONLY "public"."clientes_rifa"
    ADD CONSTRAINT "clientes_rifa_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clientes_rifa"
    ADD CONSTRAINT "clientes_rifa_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores_rifa"("id");



ALTER TABLE ONLY "public"."compras_rifa"
    ADD CONSTRAINT "compras_rifa_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compras_rifa"
    ADD CONSTRAINT "compras_rifa_cliente_rifa_id_fkey" FOREIGN KEY ("cliente_rifa_id") REFERENCES "public"."clientes_rifa"("id");



ALTER TABLE ONLY "public"."compras_rifa"
    ADD CONSTRAINT "compras_rifa_rifa_id_fkey" FOREIGN KEY ("rifa_id") REFERENCES "public"."rifas"("id");



ALTER TABLE ONLY "public"."compras_rifa"
    ADD CONSTRAINT "compras_rifa_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores_rifa"("id");



ALTER TABLE ONLY "public"."configuracoes"
    ADD CONSTRAINT "configuracoes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_comments"
    ADD CONSTRAINT "match_comments_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."partidas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_comments"
    ADD CONSTRAINT "match_comments_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens_resgate"
    ADD CONSTRAINT "mensagens_resgate_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id");



ALTER TABLE ONLY "public"."mensagens_resgate"
    ADD CONSTRAINT "mensagens_resgate_redeem_request_id_fkey" FOREIGN KEY ("redeem_request_id") REFERENCES "public"."solicitacoes_resgate"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens_resgate"
    ADD CONSTRAINT "mensagens_resgate_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens_solicitacao"
    ADD CONSTRAINT "mensagens_solicitacao_credit_request_id_fkey" FOREIGN KEY ("credit_request_id") REFERENCES "public"."solicitacoes_credito"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensagens_solicitacao"
    ADD CONSTRAINT "mensagens_solicitacao_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."numeros_rifa"
    ADD CONSTRAINT "numeros_rifa_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."numeros_rifa"
    ADD CONSTRAINT "numeros_rifa_cliente_rifa_id_fkey" FOREIGN KEY ("cliente_rifa_id") REFERENCES "public"."clientes_rifa"("id");



ALTER TABLE ONLY "public"."numeros_rifa"
    ADD CONSTRAINT "numeros_rifa_rifa_id_fkey" FOREIGN KEY ("rifa_id") REFERENCES "public"."rifas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."numeros_rifa"
    ADD CONSTRAINT "numeros_rifa_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores_rifa"("id");



ALTER TABLE ONLY "public"."pagbank_payments"
    ADD CONSTRAINT "pagbank_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partidas"
    ADD CONSTRAINT "partidas_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partidas"
    ADD CONSTRAINT "partidas_tie_break_session_id_fkey" FOREIGN KEY ("tie_break_session_id") REFERENCES "public"."tie_break_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pedidos_planos"
    ADD CONSTRAINT "pedidos_planos_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "public"."planos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_admins_id_fkey" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores_rifa"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."planos"
    ADD CONSTRAINT "planos_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id");



ALTER TABLE ONLY "public"."rifas"
    ADD CONSTRAINT "rifas_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitacoes_credito"
    ADD CONSTRAINT "solicitacoes_credito_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitacoes_credito"
    ADD CONSTRAINT "solicitacoes_credito_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitacoes_credito"
    ADD CONSTRAINT "solicitacoes_credito_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."solicitacoes_resgate"
    ADD CONSTRAINT "solicitacoes_resgate_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id");



ALTER TABLE ONLY "public"."solicitacoes_resgate"
    ADD CONSTRAINT "solicitacoes_resgate_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitacoes_resgate"
    ADD CONSTRAINT "solicitacoes_resgate_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."solicitacoes_vendedor"
    ADD CONSTRAINT "solicitacoes_vendedor_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stripe_payments"
    ADD CONSTRAINT "stripe_payments_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id");



ALTER TABLE ONLY "public"."stripe_payments"
    ADD CONSTRAINT "stripe_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tie_break_participants"
    ADD CONSTRAINT "tie_break_participants_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tie_break_participants"
    ADD CONSTRAINT "tie_break_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."tie_break_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tie_break_random_numbers"
    ADD CONSTRAINT "tie_break_random_numbers_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tie_break_random_numbers"
    ADD CONSTRAINT "tie_break_random_numbers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."tie_break_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tie_break_sessions"
    ADD CONSTRAINT "tie_break_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tie_break_sessions"
    ADD CONSTRAINT "tie_break_sessions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."partidas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tie_break_sessions"
    ADD CONSTRAINT "tie_break_sessions_winner_player_id_fkey" FOREIGN KEY ("winner_player_id") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tie_break_votes"
    ADD CONSTRAINT "tie_break_votes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tie_break_votes"
    ADD CONSTRAINT "tie_break_votes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."tie_break_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_bingo_fisico"
    ADD CONSTRAINT "vendas_bingo_fisico_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_bingo_fisico"
    ADD CONSTRAINT "vendas_bingo_fisico_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."partidas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_bingo_fisico"
    ADD CONSTRAINT "vendas_bingo_fisico_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores_rifa"("id");



ALTER TABLE ONLY "public"."vendedores_rifa"
    ADD CONSTRAINT "vendedores_rifa_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vitorias"
    ADD CONSTRAINT "vitorias_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vitorias"
    ADD CONSTRAINT "vitorias_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin_Insert_Cadastro_Vendedor" ON "public"."cadastro_vendedor" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admin_Update_Cadastro_Vendedor" ON "public"."cadastro_vendedor" FOR UPDATE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can create matches" ON "public"."partidas" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can delete all credit requests" ON "public"."solicitacoes_credito" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete all redeem requests" ON "public"."solicitacoes_resgate" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can insert credit request messages" ON "public"."mensagens_solicitacao" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can insert redeem request messages" ON "public"."mensagens_resgate" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can moderate match comments" ON "public"."match_comments" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."partidas" "p"
  WHERE (("p"."id" = "match_comments"."match_id") AND (("p"."admin_id" = "auth"."uid"()) OR ("p"."admin_id" IS NULL))))))) WITH CHECK (("public"."is_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."partidas" "p"
  WHERE (("p"."id" = "match_comments"."match_id") AND (("p"."admin_id" = "auth"."uid"()) OR ("p"."admin_id" IS NULL)))))));



CREATE POLICY "Admins can read all clientes_rifa" ON "public"."clientes_rifa" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can update acertos" ON "public"."acertos_vendedor" FOR UPDATE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can view all credit request messages" ON "public"."mensagens_solicitacao" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can view all match cards" ON "public"."cartelas_partida" FOR SELECT USING (true);



CREATE POLICY "Admins can view all player cards" ON "public"."cartelas_jogador" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all redeem request messages" ON "public"."mensagens_resgate" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can view all stripe payments" ON "public"."stripe_payments" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins delete own matches" ON "public"."partidas" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Admins delete own rifas" ON "public"."rifas" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Admins podem atualizar proprio perfil" ON "public"."admins" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Admins podem atualizar vendedores" ON "public"."vendedores_rifa" FOR UPDATE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins podem criar rifas" ON "public"."rifas" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins podem ler proprio perfil" ON "public"."admins" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Admins read all cartelas_rifa" ON "public"."cartelas_rifa" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins read own tenant compras_rifa" ON "public"."compras_rifa" FOR SELECT TO "authenticated" USING ((("comprador_id" = "auth"."uid"()) OR ("vendedor_id" IN ( SELECT "vendedores_rifa"."id"
   FROM "public"."vendedores_rifa"
  WHERE ("vendedores_rifa"."user_id" = "auth"."uid"()))) OR ("ref_vendedor_id" IN ( SELECT "vendedores_rifa"."id"
   FROM "public"."vendedores_rifa"
  WHERE ("vendedores_rifa"."user_id" = "auth"."uid"()))) OR ("public"."is_admin"() AND ("admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins update own matches" ON "public"."partidas" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Admins update own rifas" ON "public"."rifas" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Admins update own tenant credit requests" ON "public"."solicitacoes_credito" FOR UPDATE TO "authenticated" USING ((("player_id" = "auth"."uid"()) OR ("public"."is_admin"() AND ("admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins update own tenant profiles" ON "public"."perfis" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("public"."is_admin"() AND ("admins_id" = "auth"."uid"()))));



CREATE POLICY "Admins update own tenant redeem requests" ON "public"."solicitacoes_resgate" FOR UPDATE TO "authenticated" USING ((("player_id" = "auth"."uid"()) OR ("public"."is_admin"() AND ("admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins view own tenant credit requests" ON "public"."solicitacoes_credito" FOR SELECT TO "authenticated" USING ((("player_id" = "auth"."uid"()) OR ("public"."is_admin"() AND ("admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins view own tenant profiles" ON "public"."perfis" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("public"."is_admin"() AND ("admins_id" = "auth"."uid"()))));



CREATE POLICY "Admins view own tenant redeem requests" ON "public"."solicitacoes_resgate" FOR SELECT TO "authenticated" USING ((("player_id" = "auth"."uid"()) OR ("public"."is_admin"() AND ("admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins view own tenant seller requests" ON "public"."solicitacoes_vendedor" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("public"."is_admin"() AND ("admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins_view_pagbank_payments" ON "public"."pagbank_payments" FOR SELECT USING (("public"."is_admin"() AND ("admin_id" = "auth"."uid"())));



CREATE POLICY "Anon read cartelas_partida" ON "public"."cartelas_partida" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anon read configuracoes" ON "public"."configuracoes" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anon read partidas" ON "public"."partidas" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Authenticated users can insert active match comments" ON "public"."match_comments" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."partidas" "p"
  WHERE (("p"."id" = "match_comments"."match_id") AND ("p"."status" = ANY (ARRAY['open'::"public"."match_status", 'in_progress'::"public"."match_status"])) AND (("public"."is_admin"() AND ("p"."admin_id" = "auth"."uid"())) OR (EXISTS ( SELECT 1
           FROM "public"."perfis" "pf"
          WHERE (("pf"."id" = "auth"."uid"()) AND ("pf"."admins_id" = "p"."admin_id")))) OR ("p"."admin_id" IS NULL)))))));



CREATE POLICY "Authenticated users can read settings" ON "public"."configuracoes" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can view active match comments" ON "public"."match_comments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."partidas" "p"
  WHERE (("p"."id" = "match_comments"."match_id") AND ("p"."status" = ANY (ARRAY['open'::"public"."match_status", 'in_progress'::"public"."match_status"])) AND (("public"."is_admin"() AND ("p"."admin_id" = "auth"."uid"())) OR (EXISTS ( SELECT 1
           FROM "public"."perfis" "pf"
          WHERE (("pf"."id" = "auth"."uid"()) AND ("pf"."admins_id" = "p"."admin_id")))) OR ("p"."admin_id" IS NULL))))));



CREATE POLICY "Authenticated users can view matches" ON "public"."partidas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Insert messages in scope" ON "public"."mensagens_resgate" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Permitir leitura pública de perfis" ON "public"."perfis" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir leitura pública de vitórias" ON "public"."vitorias" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public read access for validation" ON "public"."vendas_bingo_fisico" FOR SELECT USING (true);



CREATE POLICY "Public read access for validation cartelas" ON "public"."cartelas_rifa" FOR SELECT USING (true);



CREATE POLICY "Public read access for validation compras" ON "public"."compras_rifa" FOR SELECT USING (true);



CREATE POLICY "Public read access for validations" ON "public"."vendas_bingo_fisico" FOR SELECT USING (true);



CREATE POLICY "Public read cadastro_vendedor" ON "public"."cadastro_vendedor" FOR SELECT USING (true);



CREATE POLICY "Public read vendedores_rifa" ON "public"."vendedores_rifa" FOR SELECT USING (true);



CREATE POLICY "Service role can read settings" ON "public"."configuracoes" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Users can create their own credit requests" ON "public"."solicitacoes_credito" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "player_id"));



CREATE POLICY "Users can insert messages into their own requests" ON "public"."mensagens_solicitacao" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."solicitacoes_credito"
  WHERE (("solicitacoes_credito"."id" = "mensagens_solicitacao"."credit_request_id") AND ("solicitacoes_credito"."player_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own cadastro" ON "public"."cadastro_vendedor" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own match cards" ON "public"."cartelas_partida" FOR INSERT WITH CHECK (("auth"."uid"() = "player_id"));



CREATE POLICY "Users can insert their own redeems" ON "public"."solicitacoes_resgate" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "player_id"));



CREATE POLICY "Users can manage their own cards" ON "public"."cartelas_jogador" USING (("auth"."uid"() = "player_id"));



CREATE POLICY "Users can resubmit their own rejected redeem requests" ON "public"."solicitacoes_resgate" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "player_id") AND ("status" = 'rejected'::"public"."credit_request_status"))) WITH CHECK (("auth"."uid"() = "player_id"));



CREATE POLICY "Users can resubmit their own rejected requests" ON "public"."solicitacoes_credito" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "player_id") AND ("status" = 'rejected'::"public"."credit_request_status"))) WITH CHECK (("auth"."uid"() = "player_id"));



CREATE POLICY "Users can update own cadastro" ON "public"."cadastro_vendedor" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view messages of their own requests" ON "public"."mensagens_solicitacao" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."solicitacoes_credito"
  WHERE (("solicitacoes_credito"."id" = "mensagens_solicitacao"."credit_request_id") AND ("solicitacoes_credito"."player_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own credit requests" ON "public"."solicitacoes_credito" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "player_id"));



CREATE POLICY "Users can view their own match cards" ON "public"."cartelas_partida" FOR SELECT USING (("auth"."uid"() = "player_id"));



CREATE POLICY "Users can view their own profile" ON "public"."perfis" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own redeems" ON "public"."solicitacoes_resgate" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view their own stripe payments" ON "public"."stripe_payments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own wins" ON "public"."vitorias" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "player_id"));



CREATE POLICY "Users can view their redeem messages" ON "public"."mensagens_resgate" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."solicitacoes_resgate"
  WHERE (("solicitacoes_resgate"."id" = "mensagens_resgate"."redeem_request_id") AND ("solicitacoes_resgate"."player_id" = "auth"."uid"())))));



CREATE POLICY "Users read own cartelas_rifa" ON "public"."cartelas_rifa" FOR SELECT TO "authenticated" USING (("compra_id" IN ( SELECT "compras_rifa"."id"
   FROM "public"."compras_rifa"
  WHERE ("compras_rifa"."comprador_id" = "auth"."uid"()))));



CREATE POLICY "Users read own compras_rifa" ON "public"."compras_rifa" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "comprador_id"));



CREATE POLICY "Users_view_own_pagbank_payments" ON "public"."pagbank_payments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Vendedor read own compras_rifa" ON "public"."compras_rifa" FOR SELECT TO "authenticated" USING ((("vendedor_id" IN ( SELECT "vendedores_rifa"."id"
   FROM "public"."vendedores_rifa"
  WHERE ("vendedores_rifa"."user_id" = "auth"."uid"()))) OR ("ref_vendedor_id" IN ( SELECT "vendedores_rifa"."id"
   FROM "public"."vendedores_rifa"
  WHERE ("vendedores_rifa"."user_id" = "auth"."uid"())))));



CREATE POLICY "acertos_insert" ON "public"."acertos_vendedor" FOR INSERT TO "authenticated" WITH CHECK (("vendedor_id" IN ( SELECT "vendedores_rifa"."id"
   FROM "public"."vendedores_rifa"
  WHERE ("vendedores_rifa"."user_id" = "auth"."uid"()))));



CREATE POLICY "acertos_select_tenant" ON "public"."acertos_vendedor" FOR SELECT TO "authenticated" USING ((("vendedor_id" IN ( SELECT "vendedores_rifa"."id"
   FROM "public"."vendedores_rifa"
  WHERE ("vendedores_rifa"."user_id" = "auth"."uid"()))) OR ("public"."is_admin"() AND ("admin_id" = "auth"."uid"()))));



ALTER TABLE "public"."acertos_vendedor" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin ve proprios modulos" ON "public"."admin_modulos" FOR SELECT USING (("admin_id" = "auth"."uid"()));



ALTER TABLE "public"."admin_modulos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated can insert own profile" ON "public"."perfis" FOR INSERT WITH CHECK ((("auth"."uid"() = "id") OR "public"."is_admin"()));



ALTER TABLE "public"."cadastro_vendedor" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cartelas_jogador" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cartelas_partida" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cartelas_rifa" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clientes_rifa" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compras_rifa" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."configuracoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mensagens_resgate" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mensagens_solicitacao" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."numeros_rifa" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagbank_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participants can read tie participants" ON "public"."tie_break_participants" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."tie_break_participants" "p2"
  WHERE (("p2"."session_id" = "tie_break_participants"."session_id") AND ("p2"."player_id" = "auth"."uid"()))))));



CREATE POLICY "participants can read tie random numbers" ON "public"."tie_break_random_numbers" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."tie_break_participants" "p"
  WHERE (("p"."session_id" = "tie_break_random_numbers"."session_id") AND ("p"."player_id" = "auth"."uid"()))))));



CREATE POLICY "participants can read tie sessions" ON "public"."tie_break_sessions" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."tie_break_participants" "p"
  WHERE (("p"."session_id" = "tie_break_sessions"."id") AND ("p"."player_id" = "auth"."uid"()))))));



CREATE POLICY "participants can read tie votes" ON "public"."tie_break_votes" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."tie_break_participants" "p"
  WHERE (("p"."session_id" = "tie_break_votes"."session_id") AND ("p"."player_id" = "auth"."uid"()))))));



ALTER TABLE "public"."partidas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedidos_planos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "publico insere pedido" ON "public"."pedidos_planos" FOR INSERT WITH CHECK (true);



CREATE POLICY "publico ve planos ativos" ON "public"."planos" FOR SELECT USING (("ativo" = true));



ALTER TABLE "public"."rifas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."solicitacoes_credito" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."solicitacoes_resgate" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."solicitacoes_vendedor" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tie_break_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tie_break_random_numbers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tie_break_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tie_break_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "todos leem numeros" ON "public"."numeros_rifa" FOR SELECT USING (true);



CREATE POLICY "todos leem rifas" ON "public"."rifas" FOR SELECT USING (true);



CREATE POLICY "users update own profile" ON "public"."perfis" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "usuario cancela propria solicitacao" ON "public"."solicitacoes_vendedor" FOR DELETE USING ((("auth"."uid"() = "user_id") AND ("status" = 'pendente'::"text")));



CREATE POLICY "usuario cria propria solicitacao" ON "public"."solicitacoes_vendedor" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "usuario ve propria solicitacao" ON "public"."solicitacoes_vendedor" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."vendas_bingo_fisico" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendedor gerencia proprios clientes" ON "public"."clientes_rifa" USING (("vendedor_id" IN ( SELECT "vendedores_rifa"."id"
   FROM "public"."vendedores_rifa"
  WHERE ("vendedores_rifa"."user_id" = "auth"."uid"()))));



CREATE POLICY "vendedor ve proprias cartelas" ON "public"."cartelas_rifa" FOR SELECT USING (true);



CREATE POLICY "vendedor ve proprio perfil" ON "public"."vendedores_rifa" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."vendedores_rifa" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vitorias" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cartelas_partida";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."match_comments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."partidas";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";























































































































































































GRANT ALL ON FUNCTION "public"."admin_adjust_credits"("p_player_id" "uuid", "p_delta" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_adjust_credits"("p_player_id" "uuid", "p_delta" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_adjust_credits"("p_player_id" "uuid", "p_delta" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_adjust_fake_credits"("p_player_id" "uuid", "p_delta" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_adjust_fake_credits"("p_player_id" "uuid", "p_delta" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_adjust_fake_credits"("p_player_id" "uuid", "p_delta" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."append_called_number"("p_match_id" "uuid", "p_num" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."append_called_number"("p_match_id" "uuid", "p_num" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_called_number"("p_match_id" "uuid", "p_num" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."aprovar_pagamento_cliente_bingo"("p_venda_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."aprovar_pagamento_cliente_bingo"("p_venda_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aprovar_pagamento_cliente_bingo"("p_venda_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."aprovar_pagamento_cliente_rifa"("p_venda_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."aprovar_pagamento_cliente_rifa"("p_venda_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aprovar_pagamento_cliente_rifa"("p_venda_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."aprovar_pedido_plano"("p_pedido_id" "uuid", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."aprovar_pedido_plano"("p_pedido_id" "uuid", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aprovar_pedido_plano"("p_pedido_id" "uuid", "p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric, "p_desconto" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric, "p_desconto" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric, "p_desconto" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric, "p_desconto" numeric, "p_mensagem_admin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric, "p_desconto" numeric, "p_mensagem_admin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aprovar_vendedor"("p_solicitacao_id" "uuid", "p_comissao" numeric, "p_desconto" numeric, "p_mensagem_admin" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_modulos_admin"("p_admin_id" "uuid", "p_modulo_bingo" boolean, "p_modulo_rifa" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_modulos_admin"("p_admin_id" "uuid", "p_modulo_bingo" boolean, "p_modulo_rifa" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_modulos_admin"("p_admin_id" "uuid", "p_modulo_bingo" boolean, "p_modulo_rifa" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."buy_card_uses"("p_player_card_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."buy_card_uses"("p_player_card_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buy_card_uses"("p_player_card_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."buy_player_card"("p_name" "text", "p_numbers" "jsonb", "p_credit_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."buy_player_card"("p_name" "text", "p_numbers" "jsonb", "p_credit_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buy_player_card"("p_name" "text", "p_numbers" "jsonb", "p_credit_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancelar_reserva_vendedor"("p_numero_rifa_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancelar_reserva_vendedor"("p_numero_rifa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancelar_reserva_vendedor"("p_numero_rifa_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb", "p_pagar_depois" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb", "p_pagar_depois" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."comprar_folhas_bingo_vendedor"("p_match_id" "uuid", "p_vendedor_id" "uuid", "p_folhas" "jsonb", "p_pagar_depois" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."comprar_numeros_rifa"("p_rifa_id" "uuid", "p_numeros" integer[]) TO "anon";
GRANT ALL ON FUNCTION "public"."comprar_numeros_rifa"("p_rifa_id" "uuid", "p_numeros" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."comprar_numeros_rifa"("p_rifa_id" "uuid", "p_numeros" integer[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."comprar_numeros_via_ref"("p_rifa_id" "uuid", "p_numeros" integer[], "p_ref_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."comprar_numeros_via_ref"("p_rifa_id" "uuid", "p_numeros" integer[], "p_ref_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."comprar_numeros_via_ref"("p_rifa_id" "uuid", "p_numeros" integer[], "p_ref_codigo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirmar_ganho_rifa"("p_rifa_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirmar_ganho_rifa"("p_rifa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirmar_ganho_rifa"("p_rifa_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."correct_called_number"("p_match_id" "uuid", "p_old_number" integer, "p_new_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."correct_called_number"("p_match_id" "uuid", "p_old_number" integer, "p_new_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."correct_called_number"("p_match_id" "uuid", "p_old_number" integer, "p_new_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_tie_break_session"("p_match_id" "uuid", "p_player_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_tie_break_session"("p_match_id" "uuid", "p_player_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_tie_break_session"("p_match_id" "uuid", "p_player_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."enviar_acerto_vendedor"("p_vendedor_id" "uuid", "p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[], "p_valor" numeric, "p_comprovante" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."enviar_acerto_vendedor"("p_vendedor_id" "uuid", "p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[], "p_valor" numeric, "p_comprovante" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enviar_acerto_vendedor"("p_vendedor_id" "uuid", "p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[], "p_valor" numeric, "p_comprovante" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enviar_comprovante_cliente_bingo"("p_codigo" "text", "p_nome" "text", "p_telefone" "text", "p_endereco" "text", "p_comprovante" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enviar_comprovante_cliente_bingo"("p_codigo" "text", "p_nome" "text", "p_telefone" "text", "p_endereco" "text", "p_comprovante" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."enviar_comprovante_cliente_bingo"("p_codigo" "text", "p_nome" "text", "p_telefone" "text", "p_endereco" "text", "p_comprovante" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enviar_comprovante_cliente_bingo"("p_codigo" "text", "p_nome" "text", "p_telefone" "text", "p_endereco" "text", "p_comprovante" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalizar_rifa"("p_rifa_id" "uuid", "p_numero_ganhador" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."finalizar_rifa"("p_rifa_id" "uuid", "p_numero_ganhador" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalizar_rifa"("p_rifa_id" "uuid", "p_numero_ganhador" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_tie_break_resolution"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_tie_break_resolution"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_tie_break_resolution"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_leaderboard"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_leaderboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_leaderboard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_profiles"("p_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_profiles"("p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_profiles"("p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_vendedor_by_codigo"("p_codigo_ref" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_vendedor_by_codigo"("p_codigo_ref" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_vendedor_by_codigo"("p_codigo_ref" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_support_contact"("p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_support_contact"("p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_support_contact"("p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tie_break_session_state"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tie_break_session_state"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tie_break_session_state"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_admin_profit"("amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_admin_profit"("amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_admin_profit"("amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_player_credits"("p_player_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_player_credits"("p_player_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_player_credits"("p_player_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_dev"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_dev"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_dev"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_number_for_match_cards"("p_match_id" "uuid", "p_num" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_number_for_match_cards"("p_match_id" "uuid", "p_num" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_number_for_match_cards"("p_match_id" "uuid", "p_num" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."next_festival_round"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."next_festival_round"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_festival_round"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."pagar_acerto_com_saldo"("p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."pagar_acerto_com_saldo"("p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pagar_acerto_com_saldo"("p_bingo_ids" "uuid"[], "p_rifa_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."pagar_comissao_acerto_manual"("p_acerto_id" "uuid", "p_valor_comissao" numeric, "p_descontar_admin" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."pagar_comissao_acerto_manual"("p_acerto_id" "uuid", "p_valor_comissao" numeric, "p_descontar_admin" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pagar_comissao_acerto_manual"("p_acerto_id" "uuid", "p_valor_comissao" numeric, "p_descontar_admin" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."pagar_compras_saldo"("p_compra_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."pagar_compras_saldo"("p_compra_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pagar_compras_saldo"("p_compra_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."popular_numeros_rifa"("p_rifa_id" "uuid", "p_inicio" integer, "p_quantidade" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."popular_numeros_rifa"("p_rifa_id" "uuid", "p_inicio" integer, "p_quantidade" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."popular_numeros_rifa"("p_rifa_id" "uuid", "p_inicio" integer, "p_quantidade" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."preparar_cartela_para_pagamento"("p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."preparar_cartela_para_pagamento"("p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."preparar_cartela_para_pagamento"("p_codigo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_redeem_request"("p_player_id" "uuid", "p_credits" numeric, "p_amount" numeric, "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_redeem_request"("p_player_id" "uuid", "p_credits" numeric, "p_amount" numeric, "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_redeem_request"("p_player_id" "uuid", "p_credits" numeric, "p_amount" numeric, "p_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_stripe_payment"("p_session_id" "text", "p_user_id" "uuid", "p_amount" numeric, "p_payment_type" "text", "p_original_amount" numeric, "p_credits_requested" numeric, "p_venda_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_stripe_payment"("p_session_id" "text", "p_user_id" "uuid", "p_amount" numeric, "p_payment_type" "text", "p_original_amount" numeric, "p_credits_requested" numeric, "p_venda_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_stripe_payment"("p_session_id" "text", "p_user_id" "uuid", "p_amount" numeric, "p_payment_type" "text", "p_original_amount" numeric, "p_credits_requested" numeric, "p_venda_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."promover_para_admin"("p_user_id" "uuid", "p_modulo_bingo" boolean, "p_modulo_rifa" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."promover_para_admin"("p_user_id" "uuid", "p_modulo_bingo" boolean, "p_modulo_rifa" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."promover_para_admin"("p_user_id" "uuid", "p_modulo_bingo" boolean, "p_modulo_rifa" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."rebaixar_admin"("p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rebaixar_admin"("p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rebaixar_admin"("p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recarregar_fake_credits"() TO "anon";
GRANT ALL ON FUNCTION "public"."recarregar_fake_credits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recarregar_fake_credits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_winner"("p_match_id" "uuid", "p_player_id" "uuid", "p_player_card_id" "uuid", "p_match_card_id" "uuid", "p_prize_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."record_winner"("p_match_id" "uuid", "p_player_id" "uuid", "p_player_card_id" "uuid", "p_match_card_id" "uuid", "p_prize_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_winner"("p_match_id" "uuid", "p_player_id" "uuid", "p_player_card_id" "uuid", "p_match_card_id" "uuid", "p_prize_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."rejeitar_pagamento_cliente_bingo"("p_venda_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rejeitar_pagamento_cliente_bingo"("p_venda_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rejeitar_pagamento_cliente_bingo"("p_venda_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rejeitar_pagamento_cliente_rifa"("p_venda_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rejeitar_pagamento_cliente_rifa"("p_venda_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rejeitar_pagamento_cliente_rifa"("p_venda_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rejeitar_vendedor"("p_solicitacao_id" "uuid", "p_mensagem_admin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rejeitar_vendedor"("p_solicitacao_id" "uuid", "p_mensagem_admin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rejeitar_vendedor"("p_solicitacao_id" "uuid", "p_mensagem_admin" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_redeem"("p_credits" numeric, "p_amount" numeric, "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_redeem"("p_credits" numeric, "p_amount" numeric, "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_redeem"("p_credits" numeric, "p_amount" numeric, "p_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reservar_numeros_vendedor"("p_rifa_id" "uuid", "p_numeros" integer[], "p_pagar_depois" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."reservar_numeros_vendedor"("p_rifa_id" "uuid", "p_numeros" integer[], "p_pagar_depois" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reservar_numeros_vendedor"("p_rifa_id" "uuid", "p_numeros" integer[], "p_pagar_depois" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolver_acerto_vendedor"("p_acerto_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolver_acerto_vendedor"("p_acerto_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolver_acerto_vendedor"("p_acerto_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_id_from_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_auth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_id_from_auth_pagbank"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_auth_pagbank"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_auth_pagbank"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_id_from_match"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_match"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_match"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_id_from_player"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_player"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_player"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_id_from_redeem_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_redeem_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_redeem_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_id_from_rifa"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_rifa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_id_from_rifa"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_manual_mode"("p_card_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_manual_mode"("p_card_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_manual_mode"("p_card_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_tie_break_random_number"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_tie_break_random_number"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_tie_break_random_number"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_tie_break_vote"("p_session_id" "uuid", "p_option" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_tie_break_vote"("p_session_id" "uuid", "p_option" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_tie_break_vote"("p_session_id" "uuid", "p_option" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_bloqueado_admin"("p_admin_id" "uuid", "p_bloqueado" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_bloqueado_admin"("p_admin_id" "uuid", "p_bloqueado" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_bloqueado_admin"("p_admin_id" "uuid", "p_bloqueado" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_bloqueado_jogador"("p_player_id" "uuid", "p_bloqueado" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_bloqueado_jogador"("p_player_id" "uuid", "p_bloqueado" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_bloqueado_jogador"("p_player_id" "uuid", "p_bloqueado" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_manual_mark"("p_card_id" "uuid", "p_num" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_manual_mark"("p_card_id" "uuid", "p_num" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_manual_mark"("p_card_id" "uuid", "p_num" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_tie_break_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_tie_break_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_tie_break_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."try_lock_match"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."try_lock_match"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_lock_match"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_game_settings"("p_settings" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_game_settings"("p_settings" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_game_settings"("p_settings" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_live_stream_settings"("p_settings" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_live_stream_settings"("p_settings" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_live_stream_settings"("p_settings" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."validar_cartela_publica"("p_codigo" "text", "p_nome" "text", "p_telefone" "text", "p_endereco" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validar_cartela_publica"("p_codigo" "text", "p_nome" "text", "p_telefone" "text", "p_endereco" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validar_cartela_publica"("p_codigo" "text", "p_nome" "text", "p_telefone" "text", "p_endereco" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validar_venda_vendedor"("p_numero_rifa_id" "uuid", "p_nome_comprador" "text", "p_telefone_comprador" "text", "p_endereco_comprador" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validar_venda_vendedor"("p_numero_rifa_id" "uuid", "p_nome_comprador" "text", "p_telefone_comprador" "text", "p_endereco_comprador" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validar_venda_vendedor"("p_numero_rifa_id" "uuid", "p_nome_comprador" "text", "p_telefone_comprador" "text", "p_endereco_comprador" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."withdraw_admin_profit"("amount_to_withdraw" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."withdraw_admin_profit"("amount_to_withdraw" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."withdraw_admin_profit"("amount_to_withdraw" numeric) TO "service_role";
























GRANT ALL ON TABLE "public"."acertos_vendedor" TO "anon";
GRANT ALL ON TABLE "public"."acertos_vendedor" TO "authenticated";
GRANT ALL ON TABLE "public"."acertos_vendedor" TO "service_role";



GRANT ALL ON TABLE "public"."admin_modulos" TO "anon";
GRANT ALL ON TABLE "public"."admin_modulos" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_modulos" TO "service_role";



GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."cadastro_vendedor" TO "anon";
GRANT ALL ON TABLE "public"."cadastro_vendedor" TO "authenticated";
GRANT ALL ON TABLE "public"."cadastro_vendedor" TO "service_role";



GRANT ALL ON TABLE "public"."cartelas_jogador" TO "anon";
GRANT ALL ON TABLE "public"."cartelas_jogador" TO "authenticated";
GRANT ALL ON TABLE "public"."cartelas_jogador" TO "service_role";



GRANT ALL ON TABLE "public"."cartelas_partida" TO "anon";
GRANT ALL ON TABLE "public"."cartelas_partida" TO "authenticated";
GRANT ALL ON TABLE "public"."cartelas_partida" TO "service_role";



GRANT ALL ON TABLE "public"."cartelas_rifa" TO "anon";
GRANT ALL ON TABLE "public"."cartelas_rifa" TO "authenticated";
GRANT ALL ON TABLE "public"."cartelas_rifa" TO "service_role";



GRANT ALL ON TABLE "public"."clientes_rifa" TO "anon";
GRANT ALL ON TABLE "public"."clientes_rifa" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes_rifa" TO "service_role";



GRANT ALL ON TABLE "public"."compras_rifa" TO "anon";
GRANT ALL ON TABLE "public"."compras_rifa" TO "authenticated";
GRANT ALL ON TABLE "public"."compras_rifa" TO "service_role";



GRANT ALL ON TABLE "public"."configuracoes" TO "anon";
GRANT ALL ON TABLE "public"."configuracoes" TO "authenticated";
GRANT ALL ON TABLE "public"."configuracoes" TO "service_role";



GRANT ALL ON TABLE "public"."match_comments" TO "anon";
GRANT ALL ON TABLE "public"."match_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."match_comments" TO "service_role";



GRANT ALL ON TABLE "public"."mensagens_resgate" TO "anon";
GRANT ALL ON TABLE "public"."mensagens_resgate" TO "authenticated";
GRANT ALL ON TABLE "public"."mensagens_resgate" TO "service_role";



GRANT ALL ON TABLE "public"."mensagens_solicitacao" TO "anon";
GRANT ALL ON TABLE "public"."mensagens_solicitacao" TO "authenticated";
GRANT ALL ON TABLE "public"."mensagens_solicitacao" TO "service_role";



GRANT ALL ON TABLE "public"."numeros_rifa" TO "anon";
GRANT ALL ON TABLE "public"."numeros_rifa" TO "authenticated";
GRANT ALL ON TABLE "public"."numeros_rifa" TO "service_role";



GRANT ALL ON TABLE "public"."pagbank_payments" TO "anon";
GRANT ALL ON TABLE "public"."pagbank_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."pagbank_payments" TO "service_role";



GRANT ALL ON TABLE "public"."partidas" TO "anon";
GRANT ALL ON TABLE "public"."partidas" TO "authenticated";
GRANT ALL ON TABLE "public"."partidas" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos_planos" TO "anon";
GRANT ALL ON TABLE "public"."pedidos_planos" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos_planos" TO "service_role";



GRANT ALL ON TABLE "public"."perfis" TO "anon";
GRANT ALL ON TABLE "public"."perfis" TO "authenticated";
GRANT ALL ON TABLE "public"."perfis" TO "service_role";



GRANT ALL ON TABLE "public"."planos" TO "anon";
GRANT ALL ON TABLE "public"."planos" TO "authenticated";
GRANT ALL ON TABLE "public"."planos" TO "service_role";



GRANT ALL ON TABLE "public"."rifas" TO "anon";
GRANT ALL ON TABLE "public"."rifas" TO "authenticated";
GRANT ALL ON TABLE "public"."rifas" TO "service_role";



GRANT ALL ON TABLE "public"."solicitacoes_credito" TO "anon";
GRANT ALL ON TABLE "public"."solicitacoes_credito" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitacoes_credito" TO "service_role";



GRANT ALL ON TABLE "public"."solicitacoes_resgate" TO "anon";
GRANT ALL ON TABLE "public"."solicitacoes_resgate" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitacoes_resgate" TO "service_role";



GRANT ALL ON TABLE "public"."solicitacoes_vendedor" TO "anon";
GRANT ALL ON TABLE "public"."solicitacoes_vendedor" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitacoes_vendedor" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_payments" TO "anon";
GRANT ALL ON TABLE "public"."stripe_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_payments" TO "service_role";



GRANT ALL ON TABLE "public"."tie_break_participants" TO "anon";
GRANT ALL ON TABLE "public"."tie_break_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."tie_break_participants" TO "service_role";



GRANT ALL ON TABLE "public"."tie_break_random_numbers" TO "anon";
GRANT ALL ON TABLE "public"."tie_break_random_numbers" TO "authenticated";
GRANT ALL ON TABLE "public"."tie_break_random_numbers" TO "service_role";



GRANT ALL ON TABLE "public"."tie_break_sessions" TO "anon";
GRANT ALL ON TABLE "public"."tie_break_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."tie_break_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."tie_break_votes" TO "anon";
GRANT ALL ON TABLE "public"."tie_break_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."tie_break_votes" TO "service_role";



GRANT ALL ON TABLE "public"."vendas_bingo_fisico" TO "anon";
GRANT ALL ON TABLE "public"."vendas_bingo_fisico" TO "authenticated";
GRANT ALL ON TABLE "public"."vendas_bingo_fisico" TO "service_role";



GRANT ALL ON TABLE "public"."vendedores_rifa" TO "anon";
GRANT ALL ON TABLE "public"."vendedores_rifa" TO "authenticated";
GRANT ALL ON TABLE "public"."vendedores_rifa" TO "service_role";



GRANT ALL ON TABLE "public"."vitorias" TO "anon";
GRANT ALL ON TABLE "public"."vitorias" TO "authenticated";
GRANT ALL ON TABLE "public"."vitorias" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































