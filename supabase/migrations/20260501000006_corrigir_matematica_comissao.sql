-- 1. CORRIGE A APROVAÇÃO DA RIFA
CREATE OR REPLACE FUNCTION public.aprovar_pagamento_cliente_rifa(p_venda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

-- 2. CORRIGE A APROVAÇÃO DO BINGO
CREATE OR REPLACE FUNCTION public.aprovar_pagamento_cliente_bingo(p_venda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;