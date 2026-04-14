import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Avatar as ShadAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from './ui/button'
import { Input } from './ui/input'
import { User, Upload } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  url: string | null
  size: number
  onUpload: (url: string) => void
}

export default function Avatar({ url, size, onUpload }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (url) downloadImage(url)
  }, [url])

  async function downloadImage(path: string) {
    try {
      const { data, error } = await supabase.storage.from('avatars').download(path)
      if (error) {
        throw error
      }
      const url = URL.createObjectURL(data)
      setAvatarUrl(url)
    } catch (error) {
      console.log('Error downloading image: ', (error as Error).message)
    }
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      setUploading(true)

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Você deve selecionar uma imagem para enviar.')
      }

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const filePath = `${Math.random()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      onUpload(filePath)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <ShadAvatar style={{ height: size, width: size }}>
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt="Avatar" />
        ) : (
          <AvatarFallback>
            <User className="w-1/2 h-1/2 text-muted-foreground" />
          </AvatarFallback>
        )}
      </ShadAvatar>
      <div>
        <Button asChild variant="outline">
          <label htmlFor="single" className="cursor-pointer">
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Enviando...' : 'Enviar Avatar'}
          </label>
        </Button>
        <Input
          style={{
            visibility: 'hidden',
            position: 'absolute',
          }}
          type="file"
          id="single"
          accept="image/*"
          onChange={uploadAvatar}
          disabled={uploading}
        />
      </div>
    </div>
  )
}