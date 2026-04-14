import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Lock, CheckCircle2 } from 'lucide-react';

const UpdatePassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return toast.error("As senhas não coincidem.");
    if (password.length < 6) return toast.error("A senha deve ter no mínimo 6 caracteres.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Senha atualizada com sucesso!");
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="card-container max-w-sm w-full space-y-6 p-8">
        <div className="text-center space-y-2">
          <h1 className="font-heading text-2xl font-black text-foreground">Nova Senha</h1>
          <p className="text-sm text-muted-foreground">Digite sua nova senha abaixo</p>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                id="new-password" 
                type="password" 
                placeholder="••••••" 
                className="pl-10" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                id="confirm-password" 
                type="password" 
                placeholder="••••••" 
                className="pl-10" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                required 
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-lg font-bold gradient-primary" disabled={loading}>
            {loading ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
            Atualizar Senha
          </Button>
        </form>
      </div>
    </div>
  );
};

export default UpdatePassword;