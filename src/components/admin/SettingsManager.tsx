import { useState, useEffect, useMemo } from 'react';
import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Save, Settings, Check, Loader2, Bot, Link as LinkIcon, DollarSign, Banknote, Play, CalendarDays, Clock, Ticket, CreditCard, SmartphoneNfc, RadioTower } from 'lucide-react';
import { LiveTransmissionSettings } from './LiveTransmissionSettings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, startOfDay } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter
} from "@/components/ui/dialog";
import { GameType, PrizeType } from '@/types/match';
import { gameTypeLabels } from '@/utils/bingoUtils';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { cn } from '@/lib/utils';

const SettingsManager = () => {
  const { gameSettings, updateGameSettings, withdrawAdminProfit } = useGame();
  const [currentSettings, setCurrentSettings] = useState({
    custo_nova_cartela: 10,
    custo_recarga_cartela: 5,
    usos_por_recarga: 1,
    intervalo_sorteio_auto_seg: 120,
    valor_por_credito: 1.00,
    n8n_test_url: '',
    n8n_prod_url: '',
    n8n_env: 'test' as 'test' | 'production',
    pix_key: '',
    pix_name: '',
    pix_city: '',
    credit_request_text: '',
    auto_engine_enabled: false,
    auto_engine_interval_mins: 60,
    auto_engine_matches_per_day: 24,
    auto_engine_game_type: 'full' as any,
    auto_engine_card_price: 10,
    auto_engine_prize_type: 'percentage' as any,
    auto_engine_prize_value: 80,
    auto_engine_start_hour: 0,
    auto_engine_max_cards: 3,
    desconto_vendedor_global: 0,
    comissao_vendedor_global: 0,
    cartelas_por_folha_bingo: 4,
    stripe_secret_key: '',
    stripe_webhook_secret: '',
    stripe_enabled: false,
    stripe_pass_fees_to_customer: false,
    stripe_fee_percentage: 3.99,
    stripe_fee_fixed: 0.39,
    stripe_env: 'test' as 'test' | 'live',
    stripe_secret_key_test: '',
    stripe_webhook_secret_test: '',
    pagbank_enabled: false,
    pagbank_env: 'sandbox' as 'sandbox' | 'producao',
    pagbank_token_sandbox: '',
    pagbank_token_producao: '',
    pagbank_pass_fees_to_customer: false,
    pagbank_pix_fee_fixed: 0.99,
    pagbank_pix_fee_percentage: 0,
    pagbank_card_fee_fixed: 0.39,
    pagbank_card_fee_percentage: 4.99,
    live_external_enabled: false,
    live_external_provider: 'manual' as 'manual' | 'restream',
    live_external_rtmp_url: '',
    live_external_stream_key: '',
    live_external_youtube_url: '',
    live_external_facebook_url: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isTestingEngine, setIsTestingEngine] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    if (gameSettings) {
      setCurrentSettings({
        ...currentSettings,
        custo_nova_cartela: gameSettings.custo_nova_cartela,
        custo_recarga_cartela: gameSettings.custo_recarga_cartela,
        usos_por_recarga: gameSettings.usos_por_recarga,
        intervalo_sorteio_auto_seg: gameSettings.intervalo_sorteio_auto_seg,
        valor_por_credito: gameSettings.valor_por_credito || 1.00,
        n8n_test_url: gameSettings.n8n_test_url || '',
        n8n_prod_url: gameSettings.n8n_prod_url || '',
        n8n_env: (gameSettings.n8n_env as 'test' | 'production') || 'test',
        pix_key: gameSettings.pix_key || '',
        pix_name: gameSettings.pix_name || 'BINGO SHOW',
        pix_city: gameSettings.pix_city || 'SAO PAULO',
        credit_request_text: gameSettings.credit_request_text || '',
        auto_engine_enabled: gameSettings.auto_engine_enabled === true,
        auto_engine_interval_mins: gameSettings.auto_engine_interval_mins || 60,
        auto_engine_matches_per_day: gameSettings.auto_engine_matches_per_day || 24,
        auto_engine_game_type: gameSettings.auto_engine_game_type || 'full',
        auto_engine_card_price: gameSettings.auto_engine_card_price || 10,
        auto_engine_prize_type: gameSettings.auto_engine_prize_type || 'percentage',
        auto_engine_prize_value: gameSettings.auto_engine_prize_value || 80,
        auto_engine_start_hour: gameSettings.auto_engine_start_hour || 0,
        auto_engine_max_cards: gameSettings.auto_engine_max_cards || 3,
        desconto_vendedor_global: gameSettings.desconto_vendedor_global || 0,
        comissao_vendedor_global: gameSettings.comissao_vendedor_global || 0,
        cartelas_por_folha_bingo: gameSettings.cartelas_por_folha_bingo || 4,
        stripe_secret_key: gameSettings.stripe_secret_key || '',
        stripe_webhook_secret: gameSettings.stripe_webhook_secret || '',
        stripe_enabled: gameSettings.stripe_enabled === true,
        stripe_pass_fees_to_customer: gameSettings.stripe_pass_fees_to_customer === true,
        stripe_fee_percentage: gameSettings.stripe_fee_percentage ?? 3.99,
        stripe_fee_fixed: gameSettings.stripe_fee_fixed ?? 0.39,
        stripe_env: gameSettings.stripe_env || 'test',
        stripe_secret_key_test: gameSettings.stripe_secret_key_test || '',
        stripe_webhook_secret_test: gameSettings.stripe_webhook_secret_test || '',
        pagbank_enabled: gameSettings.pagbank_enabled === true,
        pagbank_env: gameSettings.pagbank_env || 'sandbox',
        pagbank_token_sandbox: gameSettings.pagbank_token_sandbox || '',
        pagbank_token_producao: gameSettings.pagbank_token_producao || '',
        pagbank_pass_fees_to_customer: gameSettings.pagbank_pass_fees_to_customer === true,
        pagbank_pix_fee_fixed: gameSettings.pagbank_pix_fee_fixed ?? 0.99,
        pagbank_pix_fee_percentage: gameSettings.pagbank_pix_fee_percentage ?? 0,
        pagbank_card_fee_fixed: gameSettings.pagbank_card_fee_fixed ?? 0.39,
        pagbank_card_fee_percentage: gameSettings.pagbank_card_fee_percentage ?? 4.99,        live_external_enabled: gameSettings.live_external_enabled === true,
        live_external_provider: (gameSettings.live_external_provider as 'manual' | 'restream') || 'manual',
        live_external_rtmp_url: gameSettings.live_external_rtmp_url || '',
        live_external_stream_key: gameSettings.live_external_stream_key || '',
        live_external_youtube_url: gameSettings.live_external_youtube_url || '',
        live_external_facebook_url: gameSettings.live_external_facebook_url || '',      });
    }
  }, [gameSettings]);

  const schedulePreview = useMemo(() => {
    const times = [];
    const intervalMins = Math.max(1, Number(currentSettings.auto_engine_interval_mins));
    let checkTime = startOfDay(new Date()).getTime() + (Number(currentSettings.auto_engine_start_hour) * 3600000);
    const limit = checkTime + (24 * 3600000);
    const interval = intervalMins * 60000;

    while (checkTime < limit && times.length < Number(currentSettings.auto_engine_matches_per_day)) {
      times.push(new Date(checkTime));
      checkTime += interval;
    }
    return times;
  }, [currentSettings.auto_engine_start_hour, currentSettings.auto_engine_interval_mins, currentSettings.auto_engine_matches_per_day]);

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCurrentSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleToggleChange = async (name: string, checked: boolean) => {
    setCurrentSettings(prev => ({ ...prev, [name]: checked }));
    try {
        const success = await updateGameSettings({ [name]: checked });
        if (success) {
            toast.success(`Configuração ${checked ? 'ativada' : 'desativada'}!`);
            if (name === 'auto_engine_enabled' && checked) {
                await supabase.functions.invoke('auto-match-engine', { body: { force: true } });
            }
        } else {
            setCurrentSettings(prev => ({ ...prev, [name]: !checked }));
        }
    } catch (e) {
        setCurrentSettings(prev => ({ ...prev, [name]: !checked }));
        toast.error("Erro ao atualizar configuração.");
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setCurrentSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    const success = await updateGameSettings({
      ...currentSettings,
      custo_nova_cartela: Number(currentSettings.custo_nova_cartela),
      custo_recarga_cartela: Number(currentSettings.custo_recarga_cartela),
      usos_por_recarga: parseInt(currentSettings.usos_por_recarga as any, 10),
      intervalo_sorteio_auto_seg: parseInt(currentSettings.intervalo_sorteio_auto_seg as any, 10),
      valor_por_credito: Number(currentSettings.valor_por_credito),
      auto_engine_interval_mins: parseInt(currentSettings.auto_engine_interval_mins as any, 10),
      auto_engine_matches_per_day: parseInt(currentSettings.auto_engine_matches_per_day as any, 10),
      auto_engine_card_price: Number(currentSettings.auto_engine_card_price),
      auto_engine_prize_value: Number(currentSettings.auto_engine_prize_value),
      auto_engine_start_hour: parseInt(currentSettings.auto_engine_start_hour as any, 10),
      auto_engine_max_cards: parseInt(currentSettings.auto_engine_max_cards as any, 10),
      desconto_vendedor_global: Number(currentSettings.desconto_vendedor_global),
      comissao_vendedor_global: Number(currentSettings.comissao_vendedor_global),
      cartelas_por_folha_bingo: parseInt(currentSettings.cartelas_por_folha_bingo as any, 10),
      stripe_fee_percentage: Number(currentSettings.stripe_fee_percentage),
      stripe_fee_fixed: Number(currentSettings.stripe_fee_fixed),
      pagbank_pix_fee_fixed: Number(currentSettings.pagbank_pix_fee_fixed),
      pagbank_pix_fee_percentage: Number(currentSettings.pagbank_pix_fee_percentage),
      pagbank_card_fee_fixed: Number(currentSettings.pagbank_card_fee_fixed),
      pagbank_card_fee_percentage: Number(currentSettings.pagbank_card_fee_percentage),
      live_external_enabled: currentSettings.live_external_enabled,
      live_external_provider: currentSettings.live_external_provider,
      live_external_rtmp_url: currentSettings.live_external_rtmp_url,
      live_external_stream_key: currentSettings.live_external_stream_key,
      live_external_youtube_url: currentSettings.live_external_youtube_url,
      live_external_facebook_url: currentSettings.live_external_facebook_url,
    });
    
    setIsSaving(false);
    if (success) {
        setJustSaved(true);
        toast.success("Configurações salvas com sucesso!");
        setTimeout(() => setJustSaved(false), 2000);
    }
  };

  const handleTestEngine = async () => {
    setIsTestingEngine(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-match-engine', { body: { force: true } });
      if (error) throw error;
      if (data.success) {
        toast.success('Motor executado!', { description: `Nova partida criada: ${data.match.name}` });
      } else {
        toast.info('Motor executado, mas nenhuma partida foi criada.', { description: data.message });
      }
    } catch (e: any) {
      toast.error('Erro ao testar motor', { description: e.message });
    } finally {
      setIsTestingEngine(false);
    }
  };

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    const success = await withdrawAdminProfit(withdrawAmount);
    if (success) {
      setIsWithdrawDialogOpen(false);
      setWithdrawAmount(0);
    }
    setIsWithdrawing(false);
  };

  return (
    <div className="card-container pb-10">
      <div className="flex items-center justify-between mb-8 border-b pb-4">
        <h2 className="font-heading text-xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" /> Ajustes do Sistema
        </h2>
        <Button onClick={handleSaveSettings} className="gradient-primary shadow-button" disabled={isSaving || justSaved}>
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : justSaved ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {isSaving ? 'Salvando...' : justSaved ? 'Salvo!' : 'Salvar Alterações'}
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* ECONOMIA */}
        <div className="space-y-6 p-4 bg-muted/20 rounded-2xl border border-border/50">
          <h3 className="font-heading font-bold text-primary flex items-center gap-2"><DollarSign className="w-4 h-4" /> Economia</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-xs">Nova Cartela (cr)</Label><Input name="custo_nova_cartela" type="number" step="0.01" value={currentSettings.custo_nova_cartela} onChange={handleSettingsChange} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Recarga (cr)</Label><Input name="custo_recarga_cartela" type="number" step="0.01" value={currentSettings.custo_recarga_cartela} onChange={handleSettingsChange} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Usos por Recarga</Label><Input name="usos_por_recarga" type="number" value={currentSettings.usos_por_recarga} onChange={handleSettingsChange} /></div>
            <div className="space-y-1.5"><Label className="text-xs">R$ por Crédito</Label><Input name="valor_por_credito" type="number" step="0.01" value={currentSettings.valor_por_credito} onChange={handleSettingsChange} /></div>
          </div>
        </div>

        {/* REGRAS DE PARTIDA */}
        <div className="space-y-6 p-4 bg-muted/20 rounded-2xl border border-border/50">
          <h3 className="font-heading font-bold text-primary flex items-center gap-2"><Clock className="w-4 h-4" /> Regras de Partida</h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Intervalo entre Números (segundos)</Label>
              <Input name="intervalo_sorteio_auto_seg" type="number" value={currentSettings.intervalo_sorteio_auto_seg} onChange={handleSettingsChange} />
              <p className="text-[10px] text-muted-foreground">Tempo de espera entre cada bola sorteada no modo automático.</p>
            </div>
          </div>
        </div>

        {/* VENDEDORES */}
        <div className="space-y-6 p-4 bg-muted/20 rounded-2xl border border-border/50">
          <h3 className="font-heading font-bold text-primary flex items-center gap-2"><Ticket className="w-4 h-4" /> Sistema de Vendedores</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-xs">Desconto Global (%)</Label><Input name="desconto_vendedor_global" type="number" step="0.1" value={currentSettings.desconto_vendedor_global} onChange={handleSettingsChange} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Comissão Global (%)</Label><Input name="comissao_vendedor_global" type="number" step="0.1" value={currentSettings.comissao_vendedor_global} onChange={handleSettingsChange} /></div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Grids por Folha de Bingo Impressa</Label>
              <Input name="cartelas_por_folha_bingo" type="number" min="1" max="10" value={currentSettings.cartelas_por_folha_bingo} onChange={handleSettingsChange} />
              <p className="text-[10px] text-muted-foreground">Quantidade de cartelas por bilhete físico emitido.</p>
            </div>
          </div>
        </div>

        {/* PAGBANK */}
        <div className="space-y-6 p-4 bg-green-500/5 rounded-2xl border border-green-500/20">
          <h3 className="font-heading font-bold text-green-700 dark:text-green-500 flex items-center gap-2"><SmartphoneNfc className="w-4 h-4" /> Integração PagBank</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-background rounded-xl border border-border/50">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold">Ativar PagBank</Label>
                <p className="text-[10px] text-muted-foreground">Checkout Transparente: PIX e Cartão</p>
              </div>
              <Switch checked={currentSettings.pagbank_enabled} onCheckedChange={(checked) => handleToggleChange('pagbank_enabled', checked)} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-green-800 dark:text-green-400">Ambiente PagBank</Label>
              <RadioGroup value={currentSettings.pagbank_env} onValueChange={(v: any) => handleSelectChange('pagbank_env', v)} className="grid grid-cols-2 gap-2">
                <Label className={cn("flex items-center justify-center rounded-md border-2 p-3 cursor-pointer transition-colors", currentSettings.pagbank_env === 'sandbox' ? 'border-green-500 bg-green-500/10 text-green-800' : 'border-muted bg-popover')}><RadioGroupItem value="sandbox" className="sr-only" />Modo Teste</Label>
                <Label className={cn("flex items-center justify-center rounded-md border-2 p-3 cursor-pointer transition-colors", currentSettings.pagbank_env === 'producao' ? 'border-green-500 bg-green-500/10 text-green-800' : 'border-muted bg-popover')}><RadioGroupItem value="producao" className="sr-only" />Modo Produção</Label>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Token de Produção (PagBank)</Label>
              <Input name="pagbank_token_producao" type="password" value={currentSettings.pagbank_token_producao} onChange={handleSettingsChange} className="text-xs" placeholder="••••••••••••••••••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Token de Sandbox (Testes)</Label>
              <Input name="pagbank_token_sandbox" type="password" value={currentSettings.pagbank_token_sandbox} onChange={handleSettingsChange} className="text-xs" placeholder="••••••••••••••••••••••••" />
            </div>

            {/* Taxas do PagBank - SEMPRE VISÍVEIS */}
            <div className="space-y-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl mt-4">
               <div className="flex items-center justify-between mb-4 border-b border-green-500/20 pb-3">
                 <div className="space-y-0.5">
                   <Label className="text-sm font-bold text-green-900 dark:text-green-500">Repassar Taxas PagBank?</Label>
                   <p className="text-[10px] text-green-800/80">O cliente pagará a taxa do banco junto com o valor da cartela.</p>
                 </div>
                 <Switch checked={currentSettings.pagbank_pass_fees_to_customer} onCheckedChange={(checked) => handleToggleChange('pagbank_pass_fees_to_customer', checked)} />
               </div>
               
               <div className={cn("space-y-4 transition-opacity", !currentSettings.pagbank_pass_fees_to_customer && "opacity-50 pointer-events-none")}>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="col-span-2">
                        <p className="text-xs font-bold text-green-900 mb-1">Custo do PIX (PagBank)</p>
                     </div>
                     <div className="space-y-1.5">
                       <Label className="text-[10px] text-green-800">Taxa Fixa (R$)</Label>
                       <Input name="pagbank_pix_fee_fixed" type="number" step="0.01" value={currentSettings.pagbank_pix_fee_fixed} onChange={handleSettingsChange} className="text-xs h-8 border-green-300" />
                     </div>
                     <div className="space-y-1.5">
                       <Label className="text-[10px] text-green-800">Taxa Percentual (%)</Label>
                       <Input name="pagbank_pix_fee_percentage" type="number" step="0.01" value={currentSettings.pagbank_pix_fee_percentage} onChange={handleSettingsChange} className="text-xs h-8 border-green-300" />
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4 border-t border-green-500/20 pt-4">
                     <div className="col-span-2">
                        <p className="text-xs font-bold text-green-900 mb-1">Custo do Cartão (PagBank Checkout)</p>
                     </div>
                     <div className="space-y-1.5">
                       <Label className="text-[10px] text-green-800">Taxa Fixa (R$)</Label>
                       <Input name="pagbank_card_fee_fixed" type="number" step="0.01" value={currentSettings.pagbank_card_fee_fixed} onChange={handleSettingsChange} className="text-xs h-8 border-green-300" />
                     </div>
                     <div className="space-y-1.5">
                       <Label className="text-[10px] text-green-800">Taxa Percentual (%)</Label>
                       <Input name="pagbank_card_fee_percentage" type="number" step="0.01" value={currentSettings.pagbank_card_fee_percentage} onChange={handleSettingsChange} className="text-xs h-8 border-green-300" />
                     </div>
                   </div>
               </div>
            </div>

          </div>
        </div>

        {/* STRIPE */}
        <div className="space-y-6 p-4 bg-muted/20 rounded-2xl border border-border/50">
          <h3 className="font-heading font-bold text-primary flex items-center gap-2"><CreditCard className="w-4 h-4" /> Pagamentos via Cartão (Stripe)</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-background rounded-xl border border-border/50">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold">Ativar Stripe</Label>
                <p className="text-[10px] text-muted-foreground">Habilita pagamentos via cartão.</p>
              </div>
              <Switch checked={currentSettings.stripe_enabled} onCheckedChange={(checked) => handleToggleChange('stripe_enabled', checked)} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Ambiente Stripe</Label>
              <RadioGroup value={currentSettings.stripe_env} onValueChange={(v: any) => handleSelectChange('stripe_env', v)} className="grid grid-cols-2 gap-2">
                <Label className={cn("flex items-center justify-center rounded-md border-2 p-3 cursor-pointer", currentSettings.stripe_env === 'test' ? 'border-primary bg-primary/10' : 'border-muted bg-popover')}><RadioGroupItem value="test" className="sr-only" />Modo Teste</Label>
                <Label className={cn("flex items-center justify-center rounded-md border-2 p-3 cursor-pointer", currentSettings.stripe_env === 'live' ? 'border-primary bg-primary/10' : 'border-muted bg-popover')}><RadioGroupItem value="live" className="sr-only" />Modo Produção</Label>
              </RadioGroup>
            </div>

            <div className="space-y-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mt-4">
               <div className="flex items-center justify-between mb-4 border-b border-amber-500/20 pb-3">
                 <div className="space-y-0.5">
                   <Label className="text-sm font-bold text-amber-900 dark:text-amber-500">Repassar Taxas Stripe?</Label>
                   <p className="text-[10px] text-amber-800/80">Calcula e embute a taxa no valor final do cliente.</p>
                 </div>
                 <Switch checked={currentSettings.stripe_pass_fees_to_customer} onCheckedChange={(checked) => handleToggleChange('stripe_pass_fees_to_customer', checked)} />
               </div>
               
               <div className={cn("grid grid-cols-2 gap-4 transition-opacity", !currentSettings.stripe_pass_fees_to_customer && "opacity-50 pointer-events-none")}>
                 <div className="space-y-1.5">
                   <Label className="text-[10px] text-amber-800">Taxa Percentual (%)</Label>
                   <Input name="stripe_fee_percentage" type="number" step="0.01" value={currentSettings.stripe_fee_percentage} onChange={handleSettingsChange} className="text-xs h-8 border-amber-300" />
                 </div>
                 <div className="space-y-1.5">
                   <Label className="text-[10px] text-amber-800">Taxa Fixa (R$)</Label>
                   <Input name="stripe_fee_fixed" type="number" step="0.01" value={currentSettings.stripe_fee_fixed} onChange={handleSettingsChange} className="text-xs h-8 border-amber-300" />
                 </div>
               </div>
            </div>

            <div className="space-y-1.5"><Label className="text-xs">Stripe Secret Key (Produção)</Label><Input name="stripe_secret_key" type="password" value={currentSettings.stripe_secret_key} onChange={handleSettingsChange} className="text-xs" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Stripe Webhook Secret (Produção)</Label><Input name="stripe_webhook_secret" type="password" value={currentSettings.stripe_webhook_secret} onChange={handleSettingsChange} className="text-xs" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Stripe Secret Key (Teste)</Label><Input name="stripe_secret_key_test" type="password" value={currentSettings.stripe_secret_key_test} onChange={handleSettingsChange} className="text-xs" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Stripe Webhook Secret (Teste)</Label><Input name="stripe_webhook_secret_test" type="password" value={currentSettings.stripe_webhook_secret_test} onChange={handleSettingsChange} className="text-xs" /></div>
          </div>
        </div>

        {/* MOTOR AUTOMÁTICO */}
        <div className="space-y-6 p-4 bg-muted/20 rounded-2xl border border-border/50">
          <h3 className="font-heading font-bold text-primary flex items-center gap-2"><Bot className="w-4 h-4" /> Automação (Motor)</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-background rounded-xl border border-border/50">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold">Status do Motor</Label>
                <p className="text-[10px] text-muted-foreground">Cria partidas automaticamente.</p>
              </div>
              <Switch checked={currentSettings.auto_engine_enabled} onCheckedChange={(checked) => handleToggleChange('auto_engine_enabled', checked)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Hora Início (0-23h)</Label><Input name="auto_engine_start_hour" type="number" value={currentSettings.auto_engine_start_hour} onChange={handleSettingsChange} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Intervalo (min)</Label><Input name="auto_engine_interval_mins" type="number" value={currentSettings.auto_engine_interval_mins} onChange={handleSettingsChange} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Partidas/Dia</Label><Input name="auto_engine_matches_per_day" type="number" value={currentSettings.auto_engine_matches_per_day} onChange={handleSettingsChange} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Preço Cartela (cr)</Label><Input name="auto_engine_card_price" type="number" step="0.01" value={currentSettings.auto_engine_card_price} onChange={handleSettingsChange} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Máx Cartelas/Jogador</Label><Input name="auto_engine_max_cards" type="number" value={currentSettings.auto_engine_max_cards} onChange={handleSettingsChange} /></div>
              
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de Jogo</Label>
                <Select value={currentSettings.auto_engine_game_type} onValueChange={(v: any) => handleSelectChange('auto_engine_game_type', v)}>
                  <SelectTrigger className="h-9 text-xs bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(gameTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de Prêmio</Label>
                <Select value={currentSettings.auto_engine_prize_type} onValueChange={(v: any) => handleSelectChange('auto_engine_prize_type', v)}>
                  <SelectTrigger className="h-9 text-xs bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">% do Pote</SelectItem>
                    <SelectItem value="fixed">Valor Fixo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor do Prêmio {currentSettings.auto_engine_prize_type === 'percentage' ? '(%)' : '(cr)'}</Label>
                <Input name="auto_engine_prize_value" type="number" step="0.01" value={currentSettings.auto_engine_prize_value} onChange={handleSettingsChange} />
              </div>
            </div>

            <div className="space-y-3">
                <Label className="text-xs flex items-center gap-2"><CalendarDays className="w-3 h-3" /> Agenda Programada (Slots)</Label>
                <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto p-2 bg-background rounded-lg border border-border/50 custom-scrollbar">
                    {schedulePreview.map((time, i) => (
                        <div key={i} className="text-[9px] font-bold font-mono bg-muted/50 border rounded py-1 text-center">
                            {format(time, 'HH:mm')}
                        </div>
                    ))}
                </div>
            </div>

            <Button variant="outline" size="sm" className="w-full text-xs h-9" onClick={handleTestEngine} disabled={isTestingEngine || !currentSettings.auto_engine_enabled}>
              {isTestingEngine ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Testar Motor Agora
            </Button>
          </div>
        </div>
        
        {/* PIX MANUAL */}
        <div className="space-y-6 p-4 bg-muted/20 rounded-2xl border border-border/50">
          <h3 className="font-heading font-bold text-primary flex items-center gap-2"><Banknote className="w-4 h-4" /> PIX Manual (Comprovante)</h3>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground border border-dashed">
                A opção de PIX Manual ficará visível como alternativa gratuita (sem taxas) ou caso as automações falhem.
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Chave PIX (Admin)</Label><Input name="pix_key" value={currentSettings.pix_key} onChange={handleSettingsChange} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Nome Recebedor</Label><Input name="pix_name" value={currentSettings.pix_name} onChange={handleSettingsChange} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Cidade</Label><Input name="pix_city" value={currentSettings.pix_city} onChange={handleSettingsChange} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Texto de Instrução</Label><Textarea name="credit_request_text" value={currentSettings.credit_request_text} onChange={handleSettingsChange} rows={2} className="text-xs" /></div>
          </div>
        </div>

        {/* N8N */}
        <div className="space-y-6 p-4 bg-muted/20 rounded-2xl border border-border/50">
          <h3 className="font-heading font-bold text-primary flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Integrações (n8n)</h3>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">URL de Teste</Label><Input name="n8n_test_url" value={currentSettings.n8n_test_url} onChange={handleSettingsChange} className="text-xs" /></div>
            <div className="space-y-1.5"><Label className="text-xs">URL de Produção</Label><Input name="n8n_prod_url" value={currentSettings.n8n_prod_url} onChange={handleSettingsChange} className="text-xs" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ambiente Ativo</Label>
              <Select value={currentSettings.n8n_env} onValueChange={(v) => handleSelectChange('n8n_env', v)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="test">Teste</SelectItem><SelectItem value="production">Produção</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* LIVE EXTERNA */}
        <LiveTransmissionSettings 
          currentSettings={currentSettings}
          setCurrentSettings={setCurrentSettings}
          handleSettingsChange={handleSettingsChange}
          handleSelectChange={handleSelectChange}
          externalLiveStatus={useMemo(() => {
            if (!currentSettings.live_external_enabled) {
              return { label: 'Desativada', color: 'bg-muted text-muted-foreground' };
            }
            if (currentSettings.live_external_rtmp_url && currentSettings.live_external_stream_key) {
              return { label: 'Conectada', color: 'bg-green-500/20 text-green-700' };
            }
            return { label: 'Incompleta', color: 'bg-amber-500/20 text-amber-700' };
          }, [currentSettings.live_external_enabled, currentSettings.live_external_rtmp_url, currentSettings.live_external_stream_key])}
          missingExternalFields={useMemo(() => {
            const missing = [];
            if (currentSettings.live_external_enabled) {
              if (!currentSettings.live_external_rtmp_url) missing.push('RTMP URL');
              if (!currentSettings.live_external_stream_key) missing.push('Stream Key');
            }
            return missing;
          }, [currentSettings.live_external_enabled, currentSettings.live_external_rtmp_url, currentSettings.live_external_stream_key])}
        />

        {/* CAIXA ADMIN */}
        <div className="space-y-6 p-4 bg-primary/5 rounded-2xl border-2 border-primary/20 md:col-span-2">
          <h3 className="font-heading font-bold text-primary flex items-center gap-2"><DollarSign className="w-4 h-4" /> Caixa do Admin</h3>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Lucro Total Acumulado</p>
              <p className="text-3xl font-black font-heading text-success">
                {Number(gameSettings?.admin_profit || 0).toFixed(2)} <span className="text-sm font-bold">cr.</span>
              </p>
            </div>
            <Dialog open={isWithdrawDialogOpen} onOpenChange={setIsWithdrawDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto bg-success hover:bg-success/90 text-white font-bold h-12 px-8">
                  <Banknote className="w-5 h-5 mr-2" /> Retirar Lucro
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Retirar Lucro do Caixa</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="withdraw-amount">Créditos a Retirar</Label>
                    <Input id="withdraw-amount" type="number" step="0.01" value={withdrawAmount || ''} onChange={(e) => setWithdrawAmount(Number(e.target.value) || 0)} max={gameSettings?.admin_profit || 0} className="text-lg font-bold" />
                    <p className="text-xs text-muted-foreground">O valor será subtraído do saldo do caixa administrativo.</p>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                  <Button onClick={handleWithdraw} disabled={isWithdrawing || !withdrawAmount || withdrawAmount <= 0} className="bg-success hover:bg-success/90 text-white">
                    {isWithdrawing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirmar Retirada
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="mt-10 flex justify-center sm:justify-end">
        <Button onClick={handleSaveSettings} size="lg" className="w-full sm:w-auto gradient-primary h-14 px-10 text-lg font-bold shadow-button" disabled={isSaving || justSaved}>
          {isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : justSaved ? <Check className="w-5 h-5 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {isSaving ? 'Salvando...' : justSaved ? 'Salvo!' : 'Salvar Todas as Alterações'}
        </Button>
      </div>
    </div>
  );
};

export default SettingsManager;