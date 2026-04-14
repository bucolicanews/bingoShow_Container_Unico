import React, { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { Win } from '@/types/match';
import { useGameSettings } from '@/hooks/useGameSettings';
import { useMatches } from '@/hooks/useMatches';
import { usePlayerCards } from '@/hooks/usePlayerCards';
import { useCreditRequests } from '@/hooks/useCreditRequests';
import { useRedeemRequests } from '@/hooks/useRedeemRequests';
import { useAdminData } from '@/hooks/useAdminData';

type GameContextType = 
  ReturnType<typeof useGameSettings> &
  ReturnType<typeof useMatches> &
  ReturnType<typeof usePlayerCards> &
  ReturnType<typeof useCreditRequests> &
  ReturnType<typeof useRedeemRequests> &
  ReturnType<typeof useAdminData> &
  {
    wins: Win[];
    allWins: Win[];
    publicSellers: any[] | null;
  };

const GameContext = createContext<GameContextType | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const gameSettingsHook = useGameSettings();
  const matchesHook = useMatches();
  const playerCardsHook = usePlayerCards();
  const creditRequestsHook = useCreditRequests();
  const redeemRequestsHook = useRedeemRequests();
  const adminDataHook = useAdminData();

  const { data: wins = [] } = useQuery({
    queryKey: ['wins', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Adicionada ordenação decrescente por data para as vitórias mais recentes ficarem no topo
      const { data, error } = await supabase
        .from('vitorias')
        .select('*')
        .eq('player_id', user.id)
        .order('won_at', { ascending: false });
      if (error) throw error;
      return data as Win[];
    },
    enabled: !!user,
  });

  // Buscar Vendedores Públicos (Ativos)
  const { data: publicSellers = [] } = useQuery({
    queryKey: ['publicSellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendedores_rifa')
        .select('*')
        .eq('ativo', true)
        .order('nome');
        
      if (error) {
        console.error("Erro ao buscar vendedores", error);
        return [];
      }

      const userIds = data.map(v => v.user_id).filter(Boolean);
      let perfisData: any[] = [];
      let cadastrosData: any[] = [];
      
      if (userIds.length > 0) {
        const [resPerfis, resCadastros] = await Promise.all([
          supabase.from('perfis').select('id, avatar_url').in('id', userIds),
          supabase.from('cadastro_vendedor').select('user_id, foto_url').in('user_id', userIds)
        ]);
        
        if (resPerfis.data) perfisData = resPerfis.data;
        if (resCadastros.data) cadastrosData = resCadastros.data;
      }

      return data.map(v => ({
        ...v,
        perfis: perfisData.find(p => p.id === v.user_id) || null,
        cadastro: cadastrosData.find(c => c.user_id === v.user_id) || null
      }));
    }
  });

  const value = {
    ...gameSettingsHook,
    ...matchesHook,
    ...playerCardsHook,
    ...creditRequestsHook,
    ...redeemRequestsHook,
    ...adminDataHook,
    wins,
    allWins: adminDataHook.allWins,
    publicSellers,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = (): GameContextType => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within GameProvider');
  return context;
};