import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface MatchComment {
  id: string;
  match_id: string;
  sender_id: string;
  message: string;
  is_deleted: boolean;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string | null;
}

export const useMatchComments = (matchId: string) => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);

  const queryKey = useMemo(() => ['match-comments', matchId], [matchId]);

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!matchId || !user) return [];

      const { data, error } = await supabase
        .from('match_comments')
        .select('id, match_id, sender_id, message, is_deleted, created_at')
        .eq('match_id', matchId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) {
        // Chat nao pode quebrar a pagina da partida/livestream
        console.warn('Erro ao carregar comentarios da partida:', error.message);
        return [];
      }

      const baseComments = (data || []) as MatchComment[];
      const senderIds = Array.from(new Set(baseComments.map(c => c.sender_id)));

      if (senderIds.length === 0) return baseComments;

      const { data: profilesData } = await supabase
        .from('perfis')
        .select('id, full_name, avatar_url')
        .in('id', senderIds);

      const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
      (profilesData || []).forEach(p => profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url }));

      return baseComments.map(comment => {
        const senderProfile = profileMap.get(comment.sender_id);
        const isMine = comment.sender_id === user?.id;

        return {
          ...comment,
          sender_name: senderProfile?.full_name || (isMine ? 'Voce' : 'Participante'),
          sender_avatar: senderProfile?.avatar_url || null,
        };
      });
    },
    enabled: !!matchId && !!user,
  });

  useEffect(() => {
    if (!matchId || !user) return;

    const channel = supabase
      .channel(`match-comments-${matchId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'match_comments',
        filter: `match_id=eq.${matchId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, queryClient, queryKey, user]);

  const sendComment = async (message: string): Promise<boolean> => {
    if (!user || !matchId) return false;

    const text = message.trim();
    if (!text) return false;

    setIsSending(true);
    try {
      const { error } = await supabase.from('match_comments').insert({
        match_id: matchId,
        sender_id: user.id,
        message: text,
      });

      if (error) throw error;

      return true;
    } catch (error: any) {
      const isPermissionDenied = error?.code === '42501' || error?.status === 403;
      toast.error('Erro ao enviar comentario', {
        description: isPermissionDenied
          ? 'Sem permissao para comentar nesta partida. Verifique as politicas RLS do chat.'
          : (error?.message || 'Tente novamente.'),
      });
      return false;
    } finally {
      setIsSending(false);
    }
  };

  return {
    comments,
    isLoading,
    isSending,
    canSendAsAdmin: profile?.role === 'admin',
    sendComment,
  };
};
