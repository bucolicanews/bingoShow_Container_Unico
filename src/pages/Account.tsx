import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNavigate } from 'react-router-dom'
import Avatar from '@/components/Avatar'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Lock, Save, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

export default function Account() {
  const { session, profile, signOut } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState<string | null>(null)
  const [cpf, setCpf] = useState<string | null>(null)
  const [whatsapp, setWhatsapp] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  
  // Estados para troca de senha
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)
  
  useEffect(() => {
    if (!session) {
      navigate('/login')
    }
  }, [session, navigate])

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name)
      setCpf(profile.cpf || null)
      setWhatsapp(profile.whatsapp || null)
      setAddress(profile.address || null)
      setAvatarUrl(profile.avatar_url)
      setLoading(false)
    }
  }, [profile])

  async function updateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) return

    setLoading(true)
    const { user } = session

    const updates = {
      full_name: fullName,
      cpf,
      whatsapp,
      address,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }

    // Admin profile data lives in `admins`; regular users/vendors live in `perfis`.
    const tableName = profile?.role === 'admin' ? 'admins' : 'perfis'
    const { data, error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', user.id)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Erro ao atualizar perfil', { tableName, userId: user.id, error })
      toast.error(error.message)
    } else if (!data?.id) {
      console.error('Nenhuma linha atualizada no perfil', { tableName, userId: user.id })
      toast.error('Nenhuma linha foi atualizada. Verifique as permissoes de perfil.')
    } else {
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
      toast.success('Perfil atualizado com sucesso!')
    }
    setLoading(false)
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      return toast.error("As senhas não coincidem.")
    }
    if (newPassword.length < 6) {
      return toast.error("A senha deve ter no mínimo 6 caracteres.")
    }

    setUpdatingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Senha alterada com sucesso!")
      setNewPassword('')
      setConfirmPassword('')
    }
    setUpdatingPassword(false)
  }

  if (!session || !profile) return null;

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="card-container w-full">
        <h1 className="font-heading text-2xl font-bold text-foreground mb-6 text-center">Meu Perfil</h1>
        <form onSubmit={updateProfile} className="space-y-4">
          <Avatar
            url={avatarUrl}
            size={120}
            onUpload={(url) => {
              setAvatarUrl(url)
            }}
          />
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="text" value={session.user.email} disabled />
          </div>
          <div>
            <Label htmlFor="fullName">Nome Completo</Label>
            <Input
              id="fullName"
              type="text"
              value={fullName || ''}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                type="text"
                value={cpf || ''}
                onChange={(e) => setCpf(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                type="text"
                value={whatsapp || ''}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              type="text"
              value={address || ''}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <Button className="w-full gradient-primary shadow-button" type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Atualizar Dados
          </Button>
        </form>
      </div>

      {/* SEÇÃO DE TROCA DE SENHA */}
      <div className="card-container w-full border-t-4 border-t-amber-500">
        <h2 className="font-heading text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5 text-amber-500" /> Alterar Senha
        </h2>
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova Senha</Label>
            <Input 
              id="new-password" 
              type="password" 
              placeholder="Mínimo 6 caracteres" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
            <Input 
              id="confirm-password" 
              type="password" 
              placeholder="Repita a senha" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
            />
          </div>
          <Button variant="outline" className="w-full border-amber-500 text-amber-600 hover:bg-amber-50" type="submit" disabled={updatingPassword || !newPassword}>
            {updatingPassword ? <Loader2 className="animate-spin mr-2" /> : null}
            Salvar Nova Senha
          </Button>
        </form>
      </div>

      <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => signOut()}>
        Sair da Conta
      </Button>
    </div>
  )
}