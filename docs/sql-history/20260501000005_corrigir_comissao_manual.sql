CREATE OR REPLACE FUNCTION public.pagar_comissao_acerto_manual(p_acerto_id uuid, p_valor_comissao numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- 2. Desconta do admin (pois o admin já tinha recebido o valor cheio antes)
  IF p_valor_comissao > 0 THEN
      PERFORM public.increment_admin_profit(-p_valor_comissao);
  END IF;

  -- 3. Atualiza o acerto para registrar que a comissão foi paga
  UPDATE acertos_vendedor SET comissao_paga = COALESCE(comissao_paga, 0) + p_valor_comissao WHERE id = p_acerto_id;

  RETURN jsonb_build_object('success', true);
END;
$$;