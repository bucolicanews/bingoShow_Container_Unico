import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, MessageCircle, LifeBuoy, Phone, Send, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const formatWhatsappDisplay = (value: string | null | undefined) => {
  const digits = digitsOnly(value || '');
  if (!digits) return 'Nao informado';
  if (digits.length === 13) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value || 'Nao informado';
};

export default function Support() {
  const { gameSettings } = useGame();

  const [name, setName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [subject, setSubject] = useState('Suporte - Bingo Show');
  const [message, setMessage] = useState('');

  const { data: adminContact, isLoading } = useQuery({
    queryKey: ['support-admin-contact', gameSettings?.admin_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_support_contact', {
        p_admin_id: gameSettings?.admin_id || null,
      });
      if (error) {
        console.warn('Falha ao carregar contato do admin:', error.message);
        return null;
      }
      return Array.isArray(data) ? (data[0] as any) : (data as any);
    },
  });

  const adminName = adminContact?.full_name || gameSettings?.pix_name || 'Equipe Bingo Show';
  const adminWhatsappRaw = adminContact?.whatsapp || (gameSettings as any)?.support_whatsapp || null;
  const adminEmail = adminContact?.email || (gameSettings as any)?.support_email || '';

  const whatsappLink = useMemo(() => {
    const phone = digitsOnly(adminWhatsappRaw || '');
    if (!phone) return '';
    const text = encodeURIComponent('Ola! Preciso de ajuda no app Bingo Show.');
    return `https://wa.me/${phone}?text=${text}`;
  }, [adminWhatsappRaw]);

  const handleOpenWhatsapp = () => {
    if (!whatsappLink) {
      toast.error('WhatsApp do administrador nao foi cadastrado ainda.');
      return;
    }
    window.open(whatsappLink, '_blank', 'noopener,noreferrer');
  };

  const handleSendEmail = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!adminEmail) {
      toast.error('E-mail de suporte ainda nao foi cadastrado pelo administrador.');
      return;
    }

    if (!message.trim()) {
      toast.error('Escreva sua mensagem antes de enviar.');
      return;
    }

    const emailSubject = subject?.trim() || 'Suporte - Bingo Show';
    const body = [
      `Nome: ${name || 'Nao informado'}`,
      `Email para retorno: ${fromEmail || 'Nao informado'}`,
      '',
      'Mensagem:',
      message,
    ].join('\n');

    const mailto = `mailto:${adminEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  return (
    <div className="space-y-6">
      <section className="card-container overflow-hidden border-2 border-primary/20 p-0">
        <div className="relative bg-gradient-to-br from-teal-700 via-cyan-700 to-sky-700 px-5 py-7 text-white sm:px-8">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-black/15 blur-2xl" />
          <div className="relative">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" /> Central de Atendimento
            </p>
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">Suporte</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/90 sm:text-base">
              Fale com o administrador para tirar duvidas, resolver pagamentos e receber orientacao rapida.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-container border border-sky-300/70 bg-sky-100">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sky-800">Responsavel</p>
          <p className="font-heading text-xl font-bold text-sky-950">{isLoading ? 'Carregando...' : adminName}</p>
        </div>

        <div className="card-container border border-emerald-300/60 bg-emerald-50/70">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
            <Phone className="h-3.5 w-3.5" /> WhatsApp
          </p>
          <p className="text-sm font-semibold text-emerald-950 break-all">{formatWhatsappDisplay(adminWhatsappRaw)}</p>
          <Button onClick={handleOpenWhatsapp} className="mt-3 w-full gradient-success">
            <MessageCircle className="mr-2 h-4 w-4" /> Chamar no WhatsApp
          </Button>
        </div>

        <div className="card-container border border-cyan-300/60 bg-cyan-50/70">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-800">
            <Mail className="h-3.5 w-3.5" /> E-mail
          </p>
          <p className="text-sm font-semibold text-cyan-950 break-all">{adminEmail || 'Nao informado'}</p>
          <p className="mt-3 text-xs text-cyan-800/90">
            Use o formulario abaixo para abrir seu app de e-mail com a mensagem pronta.
          </p>
        </div>
      </section>

      <section className="card-container border border-primary/15">
        <div className="mb-4 flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-xl font-bold">Formulario de E-mail</h2>
        </div>

        <form onSubmit={handleSendEmail} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="support-name">Seu nome</Label>
              <Input
                id="support-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Digite seu nome"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-from-email">Seu e-mail para retorno</Label>
              <Input
                id="support-from-email"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-subject">Assunto</Label>
            <Input
              id="support-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto do atendimento"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-message">Mensagem</Label>
            <Textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva sua duvida ou problema"
              className="min-h-[140px]"
              maxLength={1200}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/1200</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" className="w-full sm:w-auto gradient-primary">
              <Send className="mr-2 h-4 w-4" /> Enviar por E-mail
            </Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleOpenWhatsapp}>
              <MessageCircle className="mr-2 h-4 w-4" /> Chamar no WhatsApp
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
