-- ==============================================================================
-- MIGRATION: 0108 - ISOLAMENTO DE SEGURANÇA (RLS) PARA MÚLTIPLOS ADMINS
-- ==============================================================================

-- 1. Isolando a visão de PERFIS (Jogadores)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.perfis;
DROP POLICY IF EXISTS "Admins view own tenant profiles" ON public.perfis;
CREATE POLICY "Admins view own tenant profiles" ON public.perfis
FOR SELECT TO authenticated USING (
  (id = auth.uid()) OR (public.is_admin() AND admins_id = auth.uid())
);

DROP POLICY IF EXISTS "admin update all profiles" ON public.perfis;
DROP POLICY IF EXISTS "Admins update own tenant profiles" ON public.perfis;
CREATE POLICY "Admins update own tenant profiles" ON public.perfis
FOR UPDATE TO authenticated USING (
  (id = auth.uid()) OR (public.is_admin() AND admins_id = auth.uid())
);

-- 2. Isolando SOLICITAÇÕES DE CRÉDITO
DROP POLICY IF EXISTS "Admins can view all credit requests" ON public.solicitacoes_credito;
DROP POLICY IF EXISTS "Admins view own tenant credit requests" ON public.solicitacoes_credito;
CREATE POLICY "Admins view own tenant credit requests" ON public.solicitacoes_credito
FOR SELECT TO authenticated USING (
  (player_id = auth.uid()) OR (public.is_admin() AND admin_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins can update all credit requests" ON public.solicitacoes_credito;
DROP POLICY IF EXISTS "Admins update own tenant credit requests" ON public.solicitacoes_credito;
CREATE POLICY "Admins update own tenant credit requests" ON public.solicitacoes_credito
FOR UPDATE TO authenticated USING (
  (player_id = auth.uid()) OR (public.is_admin() AND admin_id = auth.uid())
);

-- 3. Isolando SOLICITAÇÕES DE RESGATE (SAQUES)
DROP POLICY IF EXISTS "Admins can view all redeem requests" ON public.solicitacoes_resgate;
DROP POLICY IF EXISTS "Admins view own tenant redeem requests" ON public.solicitacoes_resgate;
CREATE POLICY "Admins view own tenant redeem requests" ON public.solicitacoes_resgate
FOR SELECT TO authenticated USING (
  (player_id = auth.uid()) OR (public.is_admin() AND admin_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins can update all redeem requests" ON public.solicitacoes_resgate;
DROP POLICY IF EXISTS "Admins update own tenant redeem requests" ON public.solicitacoes_resgate;
CREATE POLICY "Admins update own tenant redeem requests" ON public.solicitacoes_resgate
FOR UPDATE TO authenticated USING (
  (player_id = auth.uid()) OR (public.is_admin() AND admin_id = auth.uid())
);

-- 4. Isolando INSCRIÇÕES DE VENDEDORES
DROP POLICY IF EXISTS "admin ve todas solicitacoes" ON public.solicitacoes_vendedor;
DROP POLICY IF EXISTS "Admins view own tenant seller requests" ON public.solicitacoes_vendedor;
CREATE POLICY "Admins view own tenant seller requests" ON public.solicitacoes_vendedor
FOR SELECT TO authenticated USING (
  (user_id = auth.uid()) OR (public.is_admin() AND admin_id = auth.uid())
);

-- 5. Isolando COMPRAS DE RIFAS
DROP POLICY IF EXISTS "Admins read all compras_rifa" ON public.compras_rifa;
DROP POLICY IF EXISTS "Admins read own tenant compras_rifa" ON public.compras_rifa;
CREATE POLICY "Admins read own tenant compras_rifa" ON public.compras_rifa
FOR SELECT TO authenticated USING (
  (comprador_id = auth.uid()) OR
  (vendedor_id IN (SELECT id FROM vendedores_rifa WHERE user_id = auth.uid())) OR
  (ref_vendedor_id IN (SELECT id FROM vendedores_rifa WHERE user_id = auth.uid())) OR
  (public.is_admin() AND admin_id = auth.uid())
);

-- 6. Isolando ACERTOS DE VENDEDORES (PIX)
DROP POLICY IF EXISTS "acertos_select" ON public.acertos_vendedor;
DROP POLICY IF EXISTS "acertos_select_tenant" ON public.acertos_vendedor;
CREATE POLICY "acertos_select_tenant" ON public.acertos_vendedor
FOR SELECT TO authenticated USING (
  (vendedor_id IN (SELECT id FROM vendedores_rifa WHERE user_id = auth.uid())) OR
  (public.is_admin() AND admin_id = auth.uid())
);

-- 7. Isolando EDIÇÃO E EXCLUSÃO DE PARTIDAS
DROP POLICY IF EXISTS "Admins can update matches" ON public.partidas;
DROP POLICY IF EXISTS "Admins update own matches" ON public.partidas;
CREATE POLICY "Admins update own matches" ON public.partidas
FOR UPDATE TO authenticated USING (public.is_admin() AND admin_id = auth.uid());

DROP POLICY IF EXISTS "Admins can delete matches" ON public.partidas;
DROP POLICY IF EXISTS "Admins delete own matches" ON public.partidas;
CREATE POLICY "Admins delete own matches" ON public.partidas
FOR DELETE TO authenticated USING (public.is_admin() AND admin_id = auth.uid());

-- 8. Isolando EDIÇÃO E EXCLUSÃO DE RIFAS
DROP POLICY IF EXISTS "Admins_update_rifas" ON public.rifas;
DROP POLICY IF EXISTS "Admins update own rifas" ON public.rifas;
CREATE POLICY "Admins update own rifas" ON public.rifas
FOR UPDATE TO authenticated USING (public.is_admin() AND admin_id = auth.uid());

DROP POLICY IF EXISTS "Admins_delete_rifas" ON public.rifas;
DROP POLICY IF EXISTS "Admins delete own rifas" ON public.rifas;
CREATE POLICY "Admins delete own rifas" ON public.rifas
FOR DELETE TO authenticated USING (public.is_admin() AND admin_id = auth.uid());

-- Atualiza cache do Supabase
NOTIFY pgrst, 'reload schema';