-- Chat por partida (Fase 1)
-- Executar no SQL Editor do Supabase
-- Idempotente: pode rodar mais de uma vez com seguranca

-- 1) Tabela principal
CREATE TABLE IF NOT EXISTS public.match_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.partidas(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT match_comments_message_not_empty CHECK (length(btrim(message)) > 0),
  CONSTRAINT match_comments_message_max_len CHECK (length(message) <= 300)
);

-- 2) Indices para leitura rapida por partida + timeline
CREATE INDEX IF NOT EXISTS idx_match_comments_match_id_created_at
  ON public.match_comments (match_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_comments_sender_id
  ON public.match_comments (sender_id);

-- 3) RLS
ALTER TABLE public.match_comments ENABLE ROW LEVEL SECURITY;

-- Remove politicas antigas (caso ja existam)
DROP POLICY IF EXISTS "Admins can view all match comments" ON public.match_comments;
DROP POLICY IF EXISTS "Participants can view match comments" ON public.match_comments;
DROP POLICY IF EXISTS "Participants can insert match comments" ON public.match_comments;
DROP POLICY IF EXISTS "Authenticated users can view active match comments" ON public.match_comments;
DROP POLICY IF EXISTS "Authenticated users can insert active match comments" ON public.match_comments;
DROP POLICY IF EXISTS "Admins can moderate match comments" ON public.match_comments;

-- SELECT: usuarios autenticados do mesmo tenant podem ver chat apenas de partidas ativas
CREATE POLICY "Authenticated users can view active match comments"
ON public.match_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.partidas p
    WHERE p.id = public.match_comments.match_id
      AND p.status IN ('open', 'in_progress')
      AND (
        -- admin dono da partida
        (public.is_admin() AND p.admin_id = auth.uid())
        OR
        -- jogador vinculado ao mesmo admin/tenant da partida
        EXISTS (
          SELECT 1
          FROM public.perfis pf
          WHERE pf.id = auth.uid()
            AND pf.admins_id = p.admin_id
        )
        OR p.admin_id IS NULL -- compatibilidade com dados legados
      )
  )
);

-- INSERT: usuario autenticado comenta apenas no proprio nome e em partida ativa do mesmo tenant
CREATE POLICY "Authenticated users can insert active match comments"
ON public.match_comments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.partidas p
    WHERE p.id = public.match_comments.match_id
      AND p.status IN ('open', 'in_progress')
      AND (
        (public.is_admin() AND p.admin_id = auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.perfis pf
          WHERE pf.id = auth.uid()
            AND pf.admins_id = p.admin_id
        )
        OR p.admin_id IS NULL
      )
  )
);

-- UPDATE: somente admin pode moderar (ex.: marcar is_deleted=true)
CREATE POLICY "Admins can moderate match comments"
ON public.match_comments
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  AND EXISTS (
    SELECT 1
    FROM public.partidas p
    WHERE p.id = public.match_comments.match_id
      AND (p.admin_id = auth.uid() OR p.admin_id IS NULL)
  )
)
WITH CHECK (
  public.is_admin()
  AND EXISTS (
    SELECT 1
    FROM public.partidas p
    WHERE p.id = public.match_comments.match_id
      AND (p.admin_id = auth.uid() OR p.admin_id IS NULL)
  )
);

-- 4) Realtime
ALTER TABLE public.match_comments REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.match_comments;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
