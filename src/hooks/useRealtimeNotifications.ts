import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/types/match';
import { toast } from 'sonner';

export const useRealtimeNotifications = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channelName = `db-changes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'partidas' }, (payload: any) => {
        queryClient.setQueryData<Match[]>(['matches'], (current = []) => {
          const next = [payload.new as Match, ...current.filter(match => match.id !== payload.new.id)];
          return next.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        });
        queryClient.invalidateQueries({ queryKey: ['matches'], refetchType: 'inactive' });
        const matchName = payload.new.name;
        toast.info(`🎮 Nova partida criada: ${matchName}`, { duration: 4000 });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidas' }, (payload: any) => {
        queryClient.setQueryData<Match[]>(['matches'], (current = []) => {
          const exists = current.some(match => match.id === payload.new.id);
          const next = exists
            ? current.map(match => (match.id === payload.new.id ? { ...match, ...(payload.new as Match) } : match))
            : [payload.new as Match, ...current];
          return next.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        });
        queryClient.invalidateQueries({ queryKey: ['matches'], refetchType: 'inactive' });
        const newStatus = payload.new.status;
        const matchName = payload.new.name;
        const returnedReason = payload.new.prize?.returnedReason;
        
        if (newStatus === 'in_progress') {
          toast.success(`🔴 ${matchName} está AO VIVO!`, { duration: 5000 });
        } else if (newStatus === 'finished' && returnedReason === 'ONLY_ONE_PLAYER') {
          toast.info(`⚠️ ${matchName} encerrada: apenas 1 participante. Créditos estornados.`, { duration: 6000 });
        } else if (newStatus === 'open') {
          toast.info(`📢 ${matchName} aguardando jogadores...`, { duration: 4000 });
        } else if (newStatus === 'finished') {
          toast.success(`✅ ${matchName} finalizada!`, { duration: 4000 });
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'partidas' }, (payload: any) => {
        queryClient.setQueryData<Match[]>(['matches'], (current = []) => current.filter(match => match.id !== payload.old.id));
        queryClient.invalidateQueries({ queryKey: ['matches'], refetchType: 'inactive' });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartelas_partida' }, () => {
        queryClient.invalidateQueries({ queryKey: ['matchCards'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfis' }, () => {
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        queryClient.invalidateQueries({ queryKey: ['players'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vitorias' }, () => {
        queryClient.invalidateQueries({ queryKey: ['wins'] });
        queryClient.invalidateQueries({ queryKey: ['allWins'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracoes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
