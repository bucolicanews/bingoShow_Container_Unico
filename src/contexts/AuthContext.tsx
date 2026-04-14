import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'admin' | 'user' | 'vendedor';
  credits: number;
  fake_credits: number;
  cpf: string | null;
  whatsapp: string | null;
  address: string | null;
  bloqueado: boolean;
  admins_id?: string | null;
  vendedor_id?: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // 1. PRIMEIRO: Verifica se o usuário logado é um Admin (tabela admins)
      const { data: adminData } = await supabase
        .from('admins')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (adminData) {
        // Se achou na tabela admins, retorna o perfil forçando a role 'admin'
        return {
          ...adminData,
          role: 'admin',
          admins_id: adminData.id // O admin é dono de si mesmo
        } as Profile;
      }

      // 2. SE NÃO FOR ADMIN: Busca na tabela normal de perfis (Jogadores e Vendedores)
      const { data: profileData, error } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      
      return profileData as Profile;
    },
    enabled: !!user,
  });

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('Erro ao recuperar sessao. Limpando autenticacao local.', error.message);
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setUser(null);
        setLoadingInitial(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoadingInitial(false);
    };

    fetchSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const isAdmin = profile?.role === 'admin';

  const value = {
    session,
    user,
    profile: profile ?? null,
    isAdmin,
    loading: loadingInitial || (!!user && isLoadingProfile),
    signOut,
  };

  return <AuthContext.Provider value={value}>{!value.loading && children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};