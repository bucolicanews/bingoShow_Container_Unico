import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { GameSettings } from '@/types/match';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import { toast } from 'sonner';
import { Copy, Upload, Loader2, Minus, Plus, CreditCard, SmartphoneNfc, User, FileWarning } from 'lucide-react';
import { QrCodePix } from 'qrcode-pix';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface CreditRequestDialogProps {
  gameSettings: GameSettings | undefined;
  children: React.ReactNode;
}

export const CreditRequestDialog = ({ gameSettings, children }: CreditRequestDialogProps) => {
  const navigate = useNavigate();
  const { requestCredits } = useGame();
  const { profile, user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  
  // PagBank States
  const [isPagbankLoading, setIsPagbankLoading] = useState(false);
  const [pagbankData, setPagbankData] = useState<{qr_code: string, qr_code_text: string} | null>(null);
  const [cpfPagador, setCpfPagador] = useState('');

  const [isOpen, setIsOpen] = useState(false);
  const [credits, setCredits] = useState<number>(10);

  useEffect(() => {
    if (profile?.cpf && !cpfPagador) {
        setCpfPagador(profile.cpf);
    }
  }, [profile]);

  const amount = credits * (gameSettings?.valor_por_credito || 1);

  // === CÁLCULO DE TAXAS (STRIPE) ===
  const stripeFeeDetails = useMemo(() => {
    if (!gameSettings?.stripe_pass_fees_to_customer) return null;
    const perc = gameSettings.stripe_fee_percentage || 0;
    const fix = gameSettings.stripe_fee_fixed || 0;
    const final = (amount + fix) / (1 - (perc / 100));
    const finalRounded = Math.ceil(final * 100) / 100;
    const fee = finalRounded - amount;
    return { final: finalRounded, fee };
  }, [amount, gameSettings]);
  const finalStripeAmount = stripeFeeDetails ? stripeFeeDetails.final : amount;

  // === CÁLCULO DE TAXAS (PAGBANK) ===
  const calcPagbankFee = (method: 'pix' | 'card') => {
      if (!gameSettings?.pagbank_pass_fees_to_customer) return null;
      const perc = method === 'pix' ? (gameSettings.pagbank_pix_fee_percentage || 0) : (gameSettings.pagbank_card_fee_percentage || 0);
      const fix = method === 'pix' ? (gameSettings.pagbank_pix_fee_fixed || 0) : (gameSettings.pagbank_card_fee_fixed || 0);
      const final = (amount + fix) / (1 - (perc / 100));
      const finalRounded = Math.ceil(final * 100) / 100;
      return { final: finalRounded, fee: finalRounded - amount };
  };
  const pixFeeDetails = calcPagbankFee('pix');
  const cardFeeDetails = calcPagbankFee('card');
  const finalPixAmount = pixFeeDetails ? pixFeeDetails.final : amount;
  const finalPagbankCardAmount = cardFeeDetails ? cardFeeDetails.final : amount;

  // PIX MANUAL
  const pixPayload = useMemo(() => {
    if (!gameSettings?.pix_key || !profile) return '';
    try {
      const cleanKey = gameSettings.pix_key.replace(/\s/g, '');
      const cleanName = (gameSettings.pix_name || 'BINGOSHOW').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '').toUpperCase();
      const cleanCity = (gameSettings.pix_city || 'SAOPAULO').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '').toUpperCase();

      return QrCodePix({
        version: '01',
        key: cleanKey,
        name: cleanName,
        city: cleanCity,
        value: parseFloat(amount.toFixed(2)),
      }).payload();
    } catch (e) {
      console.error("Erro ao gerar PIX:", e);
      return '';
    }
  }, [gameSettings, profile, amount]);

  const handleCopyToClipboard = (textToCopy: string) => {
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      toast.success('Copiado para a área de transferência!');
    }
  };

  const handleStripePayment = async () => {
    setIsStripeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-session', {
        body: { amount: finalStripeAmount, type: 'credits', metadata: { credits_requested: credits } }
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank', 'noreferrer,noopener');
    } catch (e: any) { toast.error("Erro: " + e.message); } finally { setIsStripeLoading(false); }
  };

  const handlePagbankPayment = async (method: 'pix' | 'CREDIT_CARD') => {
    if (!cpfPagador.trim() || cpfPagador.replace(/\D/g, '').length < 11) {
       toast.error("Por favor, preencha um CPF válido no quadro de Identificação para prosseguir.");
       return;
    }
    if (method === 'pix') setIsPagbankLoading(true);
    else setIsStripeLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-pagbank-payment', {
        body: { 
          amount, type: 'credits', admin_id: gameSettings?.admin_id, payment_method: method,
          metadata: { credits_requested: credits, customer_cpf: cpfPagador, origin: window.location.origin }
        }
      });
      if (error) throw error;
      if (data?.success) {
        if (method === 'CREDIT_CARD' && data.checkout_link) {
           window.open(data.checkout_link, '_blank', 'noreferrer,noopener');
           toast.info("A página de pagamento foi aberta em uma nova guia.");
        } else if (method === 'pix' && data.qr_code) { 
           setPagbankData({ qr_code: data.qr_code, qr_code_text: data.qr_code_text }); 
           toast.success("PIX Gerado!"); 
        }
      } else {
        if (data?.error?.includes('CPF_REQUIRED')) toast.error("CPF Inválido! Corrija no campo acima.");
        else throw new Error(data?.error || "Erro desconhecido.");
      }
    } catch (e: any) {
      toast.error("Sua sessão expirou ou o servidor falhou. Atualize a página (F5). " + e.message);
    } finally {
      setIsPagbankLoading(false); setIsStripeLoading(false);
    }
  };

  const handleSubmitManual = async () => {
    if (!file) { toast.error('Anexe o comprovante.'); return; }
    setIsLoading(true);
    try {
      const success = await requestCredits(file, credits, amount);
      if (success) { toast.success('Solicitação enviada!'); setFile(null); setIsOpen(false); }
    } finally { setIsLoading(false); }
  };

  const handleCreditsChange = (newCredits: number) => {
    setCredits(newCredits);
    setPagbankData(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-card shadow-2xl sm:rounded-2xl border-2">
        <DialogHeader className="pt-2">
          <DialogTitle className="font-heading text-center text-3xl font-black text-foreground">Comprar Créditos v</DialogTitle>
          <DialogDescription className="text-center text-base font-medium text-gray-700 dark:text-gray-300 mt-2">
            {gameSettings?.credit_request_text || 'Escolha a quantidade de créditos e a forma de pagamento.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 pt-2 text-center">
          <div className="p-5 bg-gray-50 dark:bg-muted/30 rounded-2xl border-2 border-gray-200 dark:border-border shadow-sm flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-3">
              <Button size="icon" variant="outline" className="rounded-full h-14 w-14 border-2 shadow-sm" onClick={() => handleCreditsChange(Math.max(0.01, Number((credits - 10).toFixed(2))))}><Minus className="w-6 h-6" /></Button>
              <Input type="number" step="0.01" className="w-36 text-center text-3xl font-black bg-white dark:bg-background border-2 h-14" value={credits} onChange={(e) => handleCreditsChange(Number(e.target.value) || 0)} />
              <Button size="icon" variant="outline" className="rounded-full h-14 w-14 border-2 shadow-sm" onClick={() => handleCreditsChange(Number((credits + 10).toFixed(2)))}><Plus className="w-6 h-6" /></Button>
            </div>
            <p className="text-sm uppercase font-black tracking-wider text-gray-600 dark:text-gray-400">Valor em Créditos</p>
          </div>

          <p className="text-4xl font-heading font-black text-primary my-2 drop-shadow-sm">Total: R$ {amount.toFixed(2).replace('.', ',')}</p>

          {gameSettings?.pagbank_enabled && (
             <div className="bg-blue-50 dark:bg-blue-950/20 p-5 rounded-2xl border-2 border-blue-200 dark:border-blue-800 text-left space-y-3 shadow-sm">
                <Label className="text-base uppercase font-black text-blue-800 dark:text-blue-400 flex items-center gap-2 border-b-2 border-blue-200 dark:border-blue-800/50 pb-2">
                  <User className="w-5 h-5" /> Identificação Obrigatória
                </Label>
                <div className="space-y-2 pt-1">
                  <Label className="text-sm font-bold text-gray-800 dark:text-gray-200">Digite seu CPF *</Label>
                  <Input 
                    value={cpfPagador} 
                    onChange={e => { setCpfPagador(e.target.value); setPagbankData(null); }} 
                    placeholder="000.000.000-00" 
                    className="h-14 text-lg font-bold bg-white dark:bg-background border-2 border-blue-300 dark:border-blue-700 shadow-sm" 
                  />
                </div>
             </div>
          )}

          <div className="space-y-5 pt-4 border-t-2">
             <div className="flex items-center gap-3 text-base font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest before:flex-1 before:border-t-2 after:flex-1 after:border-t-2">
               Escolha como Pagar
                 </div>
             <div className="flex items-center gap-3 text-sm font-black text-red-600 dark:text-gray-400 ">
               Verifique seu Perfil, se está cadastrado seu CPF, TELEFONE e ENDEREÇO para evitar erros no pagamento. Em caso de dúvidas, contate o suporte.
             </div>

             {/* CARTÃO DE CRÉDITO PAGBANK */}
             {gameSettings?.pagbank_enabled && (
                <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-4">
                   <div className="flex items-center justify-between">
                     <h3 className="font-black text-xl flex items-center gap-2 text-blue-700 dark:text-blue-500"><CreditCard className="w-6 h-6" /> Cartão PagBank</h3>
    < span className = "text-2xl font-black text-blue-700 dark:text-blue-400" > R$ { finalPagbankCardAmount.toFixed(2).replace('.', ',') } </span>
                  </div>
                   {cardFeeDetails && <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-muted/50 p-3 rounded-lg border border-dashed">Acréscimo de <strong>R$ {cardFeeDetails.fee.toFixed(2)}</strong> ref. a taxa de serviço do cartão.</p>}
                   <Button className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={() => handlePagbankPayment('CREDIT_CARD')} disabled={isStripeLoading || amount <= 0}>
  { isStripeLoading?<Loader2 className = "w-6 h-6 mr-2 animate-spin" /> : null} Pagar Agora
    </Button>     
       <div className="text-sm font-black text-blue-700 dark:text-blue-400">Liberação em até 1 Hora - PagBank</div>
    </div>
       
               )}

             {/* STRIPE CARTÃO (Agora renderiza independente do PagBank) */}
             {gameSettings?.stripe_enabled && (
                <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-4">
                   <div className="flex items-center justify-between">
                     <h3 className="font-black text-xl flex items-center gap-2 text-indigo-700 dark:text-indigo-500"><CreditCard className="w-6 h-6" /> Cartão (Stripe)</h3>
                     <span className="text-2xl font-black text-indigo-700 dark:text-indigo-400">R$ {finalStripeAmount.toFixed(2).replace('.', ',')}</span>
                   </div>
                   {stripeFeeDetails && <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-muted/50 p-3 rounded-lg border border-dashed">Acréscimo de <strong>R$ {stripeFeeDetails.fee.toFixed(2)}</strong> ref. a taxa internacional.</p>}
                   <Button className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={handleStripePayment} disabled={isStripeLoading || amount <= 0}>
                      {isStripeLoading ? <Loader2 className="w-6 h-6 mr-2 animate-spin shrink-0" /> : null} Pagar Agora 
                        </Button>
                        <div className="text-sm font-black text-blue-700 dark:text-blue-400">Liberação em até 1 Hora - Stripe</div>
                </div>
             )}

             {/* PIX AUTOMÁTICO PAGBANK */}
             {gameSettings?.pagbank_enabled && (
                <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-4">
                   <div className="flex items-center justify-between">
                     <h3 className="font-black text-xl flex items-center gap-2 text-green-700 dark:text-green-500"><SmartphoneNfc className="w-6 h-6" /> PIX Rápido</h3>
                     <span className="text-2xl font-black text-green-700 dark:text-green-400">R$ {finalPixAmount.toFixed(2).replace('.', ',')}</span>
                   </div>
                   
                   {!pagbankData ? (
                     <div className="space-y-4 w-full">
                        {pixFeeDetails && <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-muted/50 p-3 rounded-lg border border-dashed">Inclui taxa bancária de R$ {pixFeeDetails.fee.toFixed(2)}.</p>}
                        <Button className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={() => handlePagbankPayment('pix')} disabled={isPagbankLoading || amount <= 0}>
                            {isPagbankLoading ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : null} Gerar QR Code PIX
                              </Button>
                               <div className="text-sm font-black text-blue-700 dark:text-blue-400">Liberação Na mesma hora</div>
                     </div>
                   ) : (
                     <div className="space-y-4 animate-in fade-in zoom-in flex flex-col items-center border-t-2 pt-4 mt-4">
                        <div className="bg-white p-4 rounded-xl shadow-md border-2 border-gray-200"><img src={pagbankData.qr_code} className="w-[200px] h-[200px]" alt="QR Code PIX" /></div>
                        <div className="w-full text-left space-y-2">
                          <Label className="text-sm uppercase font-black text-gray-700 dark:text-gray-300 block">PIX Copia e Cola</Label>
                          <div className="relative">
                            <Input value={pagbankData.qr_code_text} readOnly className="pr-24 font-mono text-sm bg-gray-50 dark:bg-background text-black dark:text-white border-2 h-14 font-bold" />
                            <Button size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-11 px-4 bg-green-600 hover:bg-green-700 text-white font-bold" onClick={() => handleCopyToClipboard(pagbankData.qr_code_text)}>
                              <Copy className="w-4 h-4 mr-2" /> Copiar
                            </Button>
                          </div>
                        </div>
                     </div>
                   )}
                </div>
             )}

             {/* PIX MANUAL (Fallback) */}
             {gameSettings?.pix_key && (
              <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-xl flex items-center gap-2 text-amber-700 dark:text-amber-500"><FileWarning className="w-6 h-6" /> PIX Manual</h3>
                    <span className="text-2xl font-black text-amber-700 dark:text-amber-400">R$ {amount.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-dashed border-amber-200 dark:border-amber-800">
                    Sem taxas extras. A liberação não é imediata e exige envio de comprovante e pode levar até 72 horas.
                  </p>
                  
                  <div className="bg-gray-50 dark:bg-muted/30 p-4 rounded-xl border-2 border-dashed flex flex-col items-center">
                      {pixPayload && <QRCode value={pixPayload} size={160} className="mb-4 bg-white p-3 rounded-xl shadow-sm border" />}
                      <div className="relative w-full">
                          <Input value={pixPayload ? "Clique para copiar chave PIX" : "Erro"} readOnly className="pr-12 text-center cursor-pointer text-sm font-bold h-12" onClick={() => handleCopyToClipboard(pixPayload)} />
                          <Button size="icon" variant="ghost" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 text-gray-700" onClick={() => handleCopyToClipboard(pixPayload)} disabled={!pixPayload}><Copy className="w-5 h-5" /></Button>
                      </div>
                  </div>

                  <div className="space-y-3 text-left pt-3">
                      <Label htmlFor="receipt" className="text-sm font-black text-gray-800 dark:text-gray-200">Anexe o Comprovante do PIX:</Label>
                      <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} className="h-12 file:mr-4 file:py-2 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-black file:bg-amber-100 file:text-amber-800 cursor-pointer" />
                      <Button className="w-full h-14 text-lg bg-amber-600 hover:bg-amber-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={handleSubmitManual} disabled={!file || isLoading}>
                         {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Upload className="w-5 h-5 mr-2" />} Enviar para Avaliação
                      </Button>
                  </div>
              </div>
             )}

          </div>
        </div>
        <DialogFooter className="pt-4 pb-2 border-t mt-4">
          <DialogClose asChild><Button variant="outline" className="w-full sm:w-auto h-12 text-base font-bold">Voltar</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};