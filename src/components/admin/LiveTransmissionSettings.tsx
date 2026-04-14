import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CircleDot, RadioTower } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveTransmissionSettingsProps {
  currentSettings: any;
  setCurrentSettings: (settings: any) => void;
  handleSettingsChange: (e: any) => void;
  handleSelectChange: (field: string, value: string) => void;
  externalLiveStatus: { label: string; color: string };
  missingExternalFields: string[];
}

export const LiveTransmissionSettings = ({
  currentSettings,
  setCurrentSettings,
  handleSettingsChange,
  handleSelectChange,
  externalLiveStatus,
  missingExternalFields,
}: LiveTransmissionSettingsProps) => {
  return (
    <div className="space-y-6 p-4 bg-red-500/5 rounded-2xl border border-red-500/20">
      <h3 className="font-heading font-bold text-red-700 flex items-center gap-2">
        <RadioTower className="w-4 h-4" /> Transmissao Externa
      </h3>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-background rounded-xl border border-border/50">
          <div className="space-y-0.5">
            <Label className="text-sm font-bold">Ativar saida RTMP externa</Label>
            <p className="text-[10px] text-muted-foreground">Permite envio para OBS, Restream, YouTube e Facebook</p>
          </div>
          <Switch 
            checked={currentSettings.live_external_enabled} 
            onCheckedChange={(checked) => 
              setCurrentSettings(prev => ({ ...prev, live_external_enabled: checked }))
            } 
          />
        </div>

        <div className="flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-muted-foreground" />
          <span className={cn('text-[11px] font-semibold px-2 py-1 rounded-md', externalLiveStatus.color)}>
            {externalLiveStatus.label}
          </span>
        </div>

        {missingExternalFields.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[11px] font-semibold text-amber-800">Status Incompleta: faltam estes campos</p>
            <p className="text-[11px] text-amber-700">{missingExternalFields.join(' e ')}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Provedor</Label>
          <Select 
            value={currentSettings.live_external_provider} 
            onValueChange={(v: 'manual' | 'restream') => handleSelectChange('live_external_provider', v)}
          >
            <SelectTrigger className="h-9 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual - RTMP direto</SelectItem>
              <SelectItem value="restream">Restream</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">RTMP URL</Label>
          <Input 
            name="live_external_rtmp_url" 
            value={currentSettings.live_external_rtmp_url} 
            onChange={handleSettingsChange} 
            className="text-xs" 
            placeholder="rtmp://a.rtmp.youtube.com/live2" 
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Stream Key</Label>
          <Input 
            name="live_external_stream_key" 
            type="password" 
            value={currentSettings.live_external_stream_key} 
            onChange={handleSettingsChange} 
            className="text-xs" 
            placeholder="••••••••••••••••" 
          />
          <p className="text-[10px] text-muted-foreground">Guardada no backend. Nunca compartilhe essa chave.</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">URL da live YouTube (opcional)</Label>
            <Input 
              name="live_external_youtube_url" 
              value={currentSettings.live_external_youtube_url} 
              onChange={handleSettingsChange} 
              className="text-xs" 
              placeholder="https://youtube.com/live/..." 
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL da live Facebook (opcional)</Label>
            <Input 
              name="live_external_facebook_url" 
              value={currentSettings.live_external_facebook_url} 
              onChange={handleSettingsChange} 
              className="text-xs" 
              placeholder="facebook.com/live" 
            />
          </div>
        </div>

        <div className="space-y-3 p-4 bg-background border border-border/50 rounded-xl">
          <p className="text-sm font-bold text-foreground">Instruções detalhadas de conexão</p>
          
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">1) Restream (recomendado para YouTube + Facebook ao mesmo tempo)</p>
            <p className="text-[11px] text-muted-foreground">a) Crie conta e conecte os destinos no Restream.</p>
            <p className="text-[11px] text-muted-foreground">b) Abra Encoder Setup e copie RTMP URL + Stream Key.</p>
            <p className="text-[11px] text-muted-foreground">c) Cole aqui no painel e também no OBS em Serviço Custom.</p>
            <p className="text-[11px] text-primary">
              <a href="https://restream.io" target="_blank" rel="noreferrer" className="underline underline-offset-2">Abrir Restream</a>
              {' • '}
              <a href="https://support.restream.io/en/articles/1229492-how-to-stream-with-obs-studio" target="_blank" rel="noreferrer" className="underline underline-offset-2">Guia OBS + Restream</a>
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border/60">
            <p className="text-xs font-semibold text-foreground">2) YouTube (transmissão direta)</p>
            <p className="text-[11px] text-muted-foreground">a) Acesse YouTube Studio e clique em Transmitir ao vivo.</p>
            <p className="text-[11px] text-muted-foreground">b) Em Configurações da transmissão, copie URL do servidor e chave.</p>
            <p className="text-[11px] text-muted-foreground">c) Use RTMP URL padrão: rtmp://a.rtmp.youtube.com/live2 (quando aplicável).</p>
            <p className="text-[11px] text-primary">
              <a href="https://studio.youtube.com" target="_blank" rel="noreferrer" className="underline underline-offset-2">Abrir YouTube Studio</a>
              {' • '}
              <a href="https://support.google.com/youtube/answer/2907883" target="_blank" rel="noreferrer" className="underline underline-offset-2">Guia oficial do YouTube Live</a>
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border/60">
            <p className="text-xs font-semibold text-foreground">3) Facebook (transmissão direta)</p>
            <p className="text-[11px] text-muted-foreground">a) Abra sua Página no Facebook e entre em Live Video.</p>
            <p className="text-[11px] text-muted-foreground">b) Copie Server URL e Stream Key exibidos na tela de live.</p>
            <p className="text-[11px] text-muted-foreground">c) Cole os dados no OBS ou no painel para organização.</p>
            <p className="text-[11px] text-primary">
              <a href="https://www.facebook.com/live/producer" target="_blank" rel="noreferrer" className="underline underline-offset-2">Abrir Facebook Live Producer</a>
              {' • '}
              <a href="https://www.facebook.com/business/help/204690076548372" target="_blank" rel="noreferrer" className="underline underline-offset-2">Guia oficial Facebook Live</a>
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border/60">
            <p className="text-xs font-semibold text-foreground">4) Configuração no OBS</p>
            <p className="text-[11px] text-muted-foreground">a) Settings &gt; Stream &gt; Service: Custom.</p>
            <p className="text-[11px] text-muted-foreground">b) Server: RTMP URL.</p>
            <p className="text-[11px] text-muted-foreground">c) Stream Key: sua chave da plataforma.</p>
            <p className="text-[11px] text-primary">
              <a href="https://obsproject.com/kb/quick-start-guide" target="_blank" rel="noreferrer" className="underline underline-offset-2">Guia rápido do OBS</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTransmissionSettings;
