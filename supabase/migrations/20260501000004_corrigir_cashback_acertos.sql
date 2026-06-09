-- 1. Adiciona a coluna para registrar a comissão paga naquele acerto
ALTER TABLE public.acertos_vendedor ADD COLUMN IF NOT EXISTS comissao_paga numeric DEFAULT 0;

-- 2. Recria a função de resolver acerto, agora calculando o Cashback do vendedor
CREATE OR REPLACE FUNCTION public.resolver_acerto_vendedor(p_acerto_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;