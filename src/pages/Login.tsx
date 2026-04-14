import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, Wand2, UserPlus } from 'lucide-react';

const Login = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    if (session) {
      navigate('/');
    }
  }, [session, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Preencha e-mail e senha.");
    
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Preencha e-mail e senha.");
    
    setLoading(true);
    const { error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          full_name: email.split('@')[0],
        }
      }
    });
    if (error) toast.error(error.message);
    else toast.success("Cadastro realizado! Verifique seu e-mail se necessário.");
    setLoading(false);
  };

  const handleMagicLink = async () => {
    if (!email) return toast.error("Digite seu e-mail primeiro.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ 
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) toast.error(error.message);
    else toast.success("Link mágico enviado para seu e-mail!");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="card-container max-w-sm w-full space-y-6 p-8">
        <div className="text-center space-y-2">
          <h1 className="font-heading text-4xl font-black text-foreground">Bingo</h1>
          <p className="text-sm text-muted-foreground">
            {view === 'login' ? 'Entre na sua conta para jogar' : 'Crie sua conta agora'}
          </p>
        </div>

        <form onSubmit={view === 'login' ? handleLogin : handleSignUp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                id="email" 
                type="email" 
                placeholder="seu@email.com" 
                className="pl-10" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••" 
                className="pl-10" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-lg font-bold gradient-primary" disabled={loading}>
            {loading ? <Loader2 className="animate-spin mr-2" /> : null}
            {view === 'login' ? 'Entrar' : 'Cadastrar'}
          </Button>
        </form>

        {view === 'login' && (
          <div className="space-y-3 pt-2 border-t">
            <Button 
              variant="outline" 
              className="w-full h-11 border-primary/30 text-primary hover:bg-primary/5 font-semibold" 
              onClick={handleMagicLink}
              disabled={loading}
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Entrar sem senha!
            </Button>
          </div>
        )}

        <div className="text-center pt-4">
          <Button 
            variant="link" 
            className="text-sm font-bold text-accent" 
            onClick={() => setView(view === 'login' ? 'signup' : 'login')}
          >
            {view === 'login' ? (
              <><UserPlus className="w-4 h-4 mr-2" /> Não tem uma conta? Cadastre-se</>
            ) : (
              'Já tem uma conta? Faça login'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Login;