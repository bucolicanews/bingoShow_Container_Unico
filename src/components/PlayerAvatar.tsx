import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Avatar as ShadAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  url: string | null;
  className?: string;
  fallback?: string;
}

export default function PlayerAvatar({ url, className, fallback }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (url) {
      downloadImage(url)
    } else {
      setAvatarUrl(null);
    }
  }, [url])

  async function downloadImage(path: string) {
    try {
      const { data, error } = await supabase.storage.from('avatars').download(path)
      if (error) {
        throw error
      }
      const objectUrl = URL.createObjectURL(data)
      setAvatarUrl(objectUrl)
    } catch (error) {
      console.log('Error downloading image: ', (error as Error).message)
    }
  }

  return (
    <ShadAvatar className={className}>
      {avatarUrl ? (
        <AvatarImage src={avatarUrl} alt="Avatar" className="object-cover" />
      ) : (
        <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs uppercase">
          {fallback ? fallback.charAt(0) : <User className="w-4 h-4" />}
        </AvatarFallback>
      )}
    </ShadAvatar>
  )
}