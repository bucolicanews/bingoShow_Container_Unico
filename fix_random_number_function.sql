-- Corrige a função submit_tie_break_random_number
-- Substitui gen_random_bytes (requer pgcrypto) por random() nativo do PostgreSQL

CREATE OR REPLACE FUNCTION public.submit_tie_break_random_number(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.get_tie_break_session_state(
  p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.submit_tie_break_vote(
  p_session_id uuid,
  p_option text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.finalize_tie_break_resolution(
  p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.get_tie_break_session_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tie_break_resolution(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tie_break_vote(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Função para corrigir/alterar um número chamado manualmente
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.correct_called_number(
  p_match_id uuid,
  p_old_number integer,
  p_new_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.correct_called_number(uuid, integer, integer) TO authenticated;
