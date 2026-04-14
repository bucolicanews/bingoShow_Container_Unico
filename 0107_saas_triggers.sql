-- ==============================================================================
-- MIGRATION: 0107 - GATILHOS (TRIGGERS) PARA PREENCHIMENTO AUTOMÁTICO DO ADMIN_ID
-- ==============================================================================

-- 1. Gatilho para o ADMIN criando coisas (Partidas, Rifas, Vendedores)
CREATE OR REPLACE FUNCTION public.set_admin_id_from_auth() RETURNS trigger AS $$
BEGIN
  IF NEW.admin_id IS NULL THEN
    NEW.admin_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_partidas_admin ON public.partidas;
CREATE TRIGGER trg_partidas_admin BEFORE INSERT ON public.partidas FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_auth();

DROP TRIGGER IF EXISTS trg_rifas_admin ON public.rifas;
CREATE TRIGGER trg_rifas_admin BEFORE INSERT ON public.rifas FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_auth();

DROP TRIGGER IF EXISTS trg_vendedores_admin ON public.vendedores_rifa;
CREATE TRIGGER trg_vendedores_admin BEFORE INSERT ON public.vendedores_rifa FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_auth();

-- 2. Gatilho para o JOGADOR/VENDEDOR criando coisas (Pega o admin_id do perfil dele)
CREATE OR REPLACE FUNCTION public.set_admin_id_from_player() RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cartelas_jogador_admin ON public.cartelas_jogador;
CREATE TRIGGER trg_cartelas_jogador_admin BEFORE INSERT ON public.cartelas_jogador FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_player();

DROP TRIGGER IF EXISTS trg_solic_credito_admin ON public.solicitacoes_credito;
CREATE TRIGGER trg_solic_credito_admin BEFORE INSERT ON public.solicitacoes_credito FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_player();

DROP TRIGGER IF EXISTS trg_solic_resgate_admin ON public.solicitacoes_resgate;
CREATE TRIGGER trg_solic_resgate_admin BEFORE INSERT ON public.solicitacoes_resgate FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_player();

DROP TRIGGER IF EXISTS trg_solic_vendedor_admin ON public.solicitacoes_vendedor;
CREATE TRIGGER trg_solic_vendedor_admin BEFORE INSERT ON public.solicitacoes_vendedor FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_player();

-- 3. Gatilho em cascata (O que pertence a uma Partida, herda o admin_id da Partida)
CREATE OR REPLACE FUNCTION public.set_admin_id_from_match() RETURNS trigger AS $$
BEGIN
  IF NEW.admin_id IS NULL THEN
    SELECT admin_id INTO NEW.admin_id FROM public.partidas WHERE id = NEW.match_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cartelas_partida_admin ON public.cartelas_partida;
CREATE TRIGGER trg_cartelas_partida_admin BEFORE INSERT ON public.cartelas_partida FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_match();

DROP TRIGGER IF EXISTS trg_vendas_bingo_admin ON public.vendas_bingo_fisico;
CREATE TRIGGER trg_vendas_bingo_admin BEFORE INSERT ON public.vendas_bingo_fisico FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_match();

-- 4. Gatilho em cascata (O que pertence a uma Rifa, herda o admin_id da Rifa)
CREATE OR REPLACE FUNCTION public.set_admin_id_from_rifa() RETURNS trigger AS $$
BEGIN
  IF NEW.admin_id IS NULL THEN
    SELECT admin_id INTO NEW.admin_id FROM public.rifas WHERE id = NEW.rifa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_numeros_rifa_admin ON public.numeros_rifa;
CREATE TRIGGER trg_numeros_rifa_admin BEFORE INSERT ON public.numeros_rifa FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_rifa();

DROP TRIGGER IF EXISTS trg_compras_rifa_admin ON public.compras_rifa;
CREATE TRIGGER trg_compras_rifa_admin BEFORE INSERT ON public.compras_rifa FOR EACH ROW EXECUTE FUNCTION set_admin_id_from_rifa();