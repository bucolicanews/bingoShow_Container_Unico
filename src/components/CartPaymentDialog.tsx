import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Copy, CreditCard, SmartphoneNfc, FileWarning, User, Upload } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCodePix } from 'qrcode-pix';
import { toast } from 'sonner';
import { useGame } from '@/contexts/GameContext';
import { log } from 'console';

interface CartPaymentDialogProps {
  codigoValidacao: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CartPaymentDialog = ({ codigoValidacao, open, onOpenChange }: CartPaymentDialogProps) => {
  const [venda, setVenda] = useState<any | null>(null);
  const [tipoVenda, setTipoVenda] = useState<'bingo' | 'rifa' | null>(null);
  const [gameSettings, setGameSettings] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [isPagbankLoading, setIsPagbankLoading] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [pagbankData, setPagbankData] = useState<{ qr_code: string; qr_code_text: string } | null>(null);
  const [nomePagador, setNomePagador] = useState('');
  const [telefonePagador, setTelefonePagador] = useState('');
  const [cpfPagador, setCpfPagador] = useState('');
  const { requestCredits } = useGame();
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [credits, setCredits] = useState<number>(10);  
  const amount = credits * (gameSettings?.valor_por_credito || 1);
  

  useEffect(() => {
    if (!open || !codigoValidacao) return;
    setVenda(null);
    setTipoVenda(null);
    setPagbankData(null);
    setLoading(true);

    async function loadData() {
      await supabase.rpc('preparar_cartela_para_pagamento', { p_codigo: codigoValidacao.toUpperCase().trim() });
      const { data: resConfig } = await supabase.from('configuracoes').select('*').single();
      if (resConfig) setGameSettings(resConfig);

      const { data: resBingo } = await supabase.from('vendas_bingo_fisico').select('*, partidas(name)').eq('codigo_validacao', codigoValidacao.toUpperCase().trim()).maybeSingle();
      if (resBingo) {
        setVenda(resBingo); setTipoVenda('bingo');
        if (resBingo.nome_comprador) setNomePagador(resBingo.nome_comprador);
        if (resBingo.telefone_comprador) setTelefonePagador(resBingo.telefone_comprador);
        setLoading(false); return;
      }

      const { data: resRifa } = await supabase.from('cartelas_rifa').select('*, compras_rifa(*, rifas(nome)), numeros_rifa(nome_comprador, telefone_comprador)').eq('codigo_validacao', codigoValidacao.toUpperCase().trim()).maybeSingle();
      if (resRifa && resRifa.compras_rifa) {
        setVenda({ id: resRifa.compras_rifa.id, cartela_id: resRifa.id, status: resRifa.compras_rifa.status, codigo_validacao: resRifa.codigo_validacao, valor_pago: resRifa.compras_rifa.valor_total, desconto_aplicado: resRifa.compras_rifa.desconto_aplicado, partidas: { name: resRifa.compras_rifa.rifas?.nome }, admin_id: resRifa.admin_id });
        setTipoVenda('rifa');
        const info = Array.isArray(resRifa.numeros_rifa) ? resRifa.numeros_rifa[0] : resRifa.numeros_rifa;
        if (info?.nome_comprador) setNomePagador(info.nome_comprador);
        if (info?.telefone_comprador) setTelefonePagador(info.telefone_comprador);
      }
      setLoading(false);
    }
    loadData();
  }, [open, codigoValidacao]);

  

  const valorCheio = useMemo(() => {
    if (!venda) return 0;
    const desc = Number(venda.desconto_aplicado || 0);
    if (desc >= 100) return Number(venda.valor_pago);
    return Number(venda.valor_pago) / (1 - (desc / 100));
  }, [venda]);

  const calcFee = (method: 'pix' | 'card') => {
    if (!gameSettings?.pagbank_pass_fees_to_customer) return null;
    const perc = method === 'pix' ? (gameSettings.pagbank_pix_fee_percentage || 0) : (gameSettings.pagbank_card_fee_percentage || 0);
    const fix = method === 'pix' ? (gameSettings.pagbank_pix_fee_fixed || 0) : (gameSettings.pagbank_card_fee_fixed || 0);
    const final = (valorCheio + fix) / (1 - (perc / 100));
    const finalRounded = Math.ceil(final * 100) / 100;
    return { final: finalRounded, fee: finalRounded - valorCheio };
  };

  const pixFeeDetails = calcFee('pix');
  const cardFeeDetails = calcFee('card');

  const finalStripeAmount = useMemo(() => {
    if (!gameSettings?.stripe_pass_fees_to_customer) return valorCheio;
    const perc = gameSettings.stripe_fee_percentage || 0;
    const fix = gameSettings.stripe_fee_fixed || 0;
    const f = (valorCheio + fix) / (1 - (perc / 100));
    return Math.ceil(f * 100) / 100;
  }, [valorCheio, gameSettings]);

  const stripeFeeDetails = useMemo(() => {
    if (!gameSettings?.stripe_pass_fees_to_customer) return null;
    const fee = finalStripeAmount - valorCheio;
    if (fee <= 0) return null;
    return { final: finalStripeAmount, fee };
  }, [finalStripeAmount, valorCheio, gameSettings]);

  const pixPayload = useMemo(() => {
    if (!gameSettings?.pix_key || !venda) return '';
    try {
      const cleanKey = gameSettings.pix_key.replace(/\s/g, '');
      const cleanName = (gameSettings.pix_name || 'BINGOSHOW').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '').toUpperCase();
      const cleanCity = (gameSettings.pix_city || 'SAOPAULO').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '').toUpperCase();
      return QrCodePix({ version: '01', key: cleanKey, name: cleanName, city: cleanCity, value: parseFloat(valorCheio.toFixed(2)) }).payload();
    } catch { return ''; }
  }, [gameSettings, venda, valorCheio]);

  const handleCopiarPix = (text: string) => {
    if (text) { navigator.clipboard.writeText(text); toast.success('Código copiado!'); }
  };

  const handlePagbankPayment = async (method: 'pix' | 'CREDIT_CARD') => {
    if (!nomePagador.trim() || !telefonePagador.trim() || !cpfPagador.trim()) {
      toast.error('Por favor, preencha Nome, WhatsApp e CPF para identificar sua cartela.');
      return;
    }
    if (method === 'pix') setIsPagbankLoading(true);
    else setIsStripeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-pagbank-payment', {
        body: {
          amount: valorCheio, type: tipoVenda === 'bingo' ? 'venda_bingo' : 'venda_rifa',
          metadata: { venda_id: venda.id, codigo: venda.codigo_validacao, customer_cpf: cpfPagador, cliente_nome: nomePagador.trim(), cliente_telefone: telefonePagador.trim(), origin: window.location.origin },
          admin_id: venda.admin_id || gameSettings?.admin_id, payment_method: method
        }
      });
      if (error) throw error;
      if (data?.success) {
        if (method === 'CREDIT_CARD' && data.checkout_link) {
          window.open(data.checkout_link, '_blank', 'noreferrer,noopener');
          toast.info('A página de pagamento foi aberta em uma nova aba.');
        } else if (method === 'pix' && data.qr_code) {
          setPagbankData({ qr_code: data.qr_code, qr_code_text: data.qr_code_text });
          toast.success('PIX Gerado! Realize o pagamento.');
        }
      } else {
        if (data?.error?.includes('CPF_REQUIRED')) toast.error('CPF Inválido. Digite um CPF correto com 11 números.');
        else throw new Error(data?.error || 'Erro na geração.');
      }
    } catch (e: any) {
      if (e.message === 'Failed to fetch' || e.message.includes('NetworkError')) toast.error('Sua conexão de internet falhou. Verifique seu sinal e tente novamente.');
      else toast.error('Erro do Banco: ' + e.message);
    } finally {
      setIsPagbankLoading(false); setIsStripeLoading(false);
    }
  };
  const handleSubmitManual = async () => {
    if (!file) { toast.error('Anexe o comprovante.'); return; }
    setIsLoading(true);
      setCredits(credits);
    setPagbankData(null);
    try {
      const success = await requestCredits(file, credits, amount);
      if (success) { toast.success('Solicitação enviada!'); setFile(null); setIsOpen(false); }
    } finally { setIsLoading(false); }
  };


  const handleStripePayment = async () => {
    setIsStripeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-session', {
        body: { amount: finalStripeAmount, type: tipoVenda === 'bingo' ? 'venda_bingo' : 'venda_rifa', metadata: { venda_id: venda.id, codigo: venda.codigo_validacao, origin: window.location.origin } }
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank', 'noreferrer,noopener');
    } catch (e: any) { toast.error('Erro ao iniciar pagamento: ' + e.message); } finally { setIsStripeLoading(false); }
  };

 
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-card shadow-2xl sm:rounded-2xl border-2">
        <DialogHeader className="pt-2">
          <DialogTitle className="font-heading text-center text-3xl font-black text-foreground">Pagamento do Bilhete</DialogTitle>
          <DialogDescription className="text-center text-base font-medium text-gray-700 dark:text-gray-300 mt-2">
            Escolha a forma de pagamento para ativar sua cartela e concorrer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
          ) : !venda ? (
            <p className="text-center text-red-600 font-bold py-8">Não foi possível carregar os dados da cartela.</p>
          ) : (
            <>
              <div className="text-center">
                <p className="text-sm font-mono bg-gray-100 dark:bg-muted inline-block px-3 py-1.5 rounded-lg border font-bold text-gray-700 dark:text-gray-200">
                  {venda.partidas?.name} · {venda.codigo_validacao}
                </p>
                <p className="text-4xl font-heading font-black text-primary mt-3 drop-shadow-sm">
                  Total: R$ {valorCheio.toFixed(2).replace('.', ',')}
                </p>
              </div>

              {gameSettings?.pagbank_enabled && (
                <div className="space-y-5">
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-5 rounded-2xl border-2 border-blue-200 dark:border-blue-800 space-y-3 shadow-sm">
                    <Label className="text-base uppercase font-black text-blue-800 dark:text-blue-400 flex items-center gap-2 border-b-2 border-blue-200 dark:border-blue-800/50 pb-2">
                      <User className="w-5 h-5" /> Identificação Obrigatória
                    </Label>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-gray-800 dark:text-gray-200">Seu Nome Completo</Label>
                      <Input value={nomePagador} onChange={e => setNomePagador(e.target.value)} className="h-12 text-base font-medium bg-white dark:bg-background border-2 border-blue-200 dark:border-blue-800" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-gray-800 dark:text-gray-200">Seu WhatsApp</Label>
                      <Input value={telefonePagador} onChange={e => setTelefonePagador(e.target.value)} type="tel" className="h-12 text-base font-medium bg-white dark:bg-background border-2 border-blue-200 dark:border-blue-800" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-gray-800 dark:text-gray-200">Seu CPF *</Label>
                      <Input value={cpfPagador} onChange={e => { setCpfPagador(e.target.value); setPagbankData(null); }} placeholder="Apenas números" className="h-14 text-lg font-bold bg-white dark:bg-background border-2 border-blue-400 dark:border-blue-600 shadow-inner" />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-base font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest before:flex-1 before:border-t-2 after:flex-1 after:border-t-2">
                    Escolha como Pagar
                  </div>

                  <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-xl flex items-center gap-2 text-blue-700 dark:text-blue-500"><CreditCard className="w-6 h-6" /> Cartão PagBank</h3>
                      <span className="text-2xl font-black text-blue-700 dark:text-blue-400">R$ {(cardFeeDetails?.final || valorCheio).toFixed(2).replace('.', ',')}</span>
                    </div>
                    {cardFeeDetails && <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-muted/50 p-3 rounded-lg border border-dashed">Acréscimo de <strong>R$ {cardFeeDetails.fee.toFixed(2)}</strong> ref. a taxa de serviço do cartão.</p>}
                    <Button className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={() => handlePagbankPayment('CREDIT_CARD')} disabled={isStripeLoading || valorCheio <= 0}>
                      {isStripeLoading ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : null} Pagar no Cartão Seguro
                    </Button>
                  </div>

                  <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-xl flex items-center gap-2 text-green-700 dark:text-green-500"><SmartphoneNfc className="w-6 h-6" /> PIX Rápido</h3>
                      <span className="text-2xl font-black text-green-700 dark:text-green-400">R$ {(pixFeeDetails?.final || valorCheio).toFixed(2).replace('.', ',')}</span>
                    </div>
                    {!pagbankData ? (
                      <div className="space-y-4 w-full">
                        {pixFeeDetails && <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-muted/50 p-3 rounded-lg border border-dashed">Inclui taxa bancária de R$ {pixFeeDetails.fee.toFixed(2)}.</p>}
                        <Button className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={() => handlePagbankPayment('pix')} disabled={isPagbankLoading || valorCheio <= 0}>
                          {isPagbankLoading ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : null} Gerar QR Code PIX
                        </Button>
                        <div className="text-sm font-black text-blue-700 dark:text-blue-400">Liberação Na mesma hora</div>
                      </div>
                    ) : (
                      <div className="space-y-4 animate-in fade-in zoom-in flex flex-col items-center border-t-2 pt-5 mt-5">
                        <div className="bg-white p-4 rounded-xl shadow-md border-2 border-gray-200"><img src={pagbankData.qr_code} className="w-[200px] h-[200px]" alt="QR Code PIX" /></div>
                        <div className="w-full text-left space-y-2">
                          <Label className="text-sm uppercase font-black text-gray-700 dark:text-gray-300 block">PIX Copia e Cola</Label>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <Input value={pagbankData.qr_code_text} readOnly className="font-mono text-sm bg-gray-50 dark:bg-background text-black dark:text-white border-2 h-14 font-bold flex-1" />
                            <Button className="h-14 px-6 bg-green-600 hover:bg-green-700 text-white font-bold text-base" onClick={() => handleCopiarPix(pagbankData.qr_code_text)}><Copy className="w-5 h-5 mr-2" /> Copiar</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {gameSettings?.stripe_enabled && (
                <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-xl flex items-center gap-2 text-indigo-700 dark:text-indigo-500"><CreditCard className="w-6 h-6" /> Cartão (Stripe)</h3>
                    <span className="text-2xl font-black text-indigo-700 dark:text-indigo-400">R$ {finalStripeAmount.toFixed(2).replace('.', ',')}</span>
                  </div>
                  {stripeFeeDetails && <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-muted/50 p-3 rounded-lg border border-dashed">Acréscimo de <strong>R$ {stripeFeeDetails.fee.toFixed(2)}</strong> ref. a taxa internacional.</p>}
                  <Button className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={handleStripePayment} disabled={isStripeLoading || valorCheio <= 0}>
                    {isStripeLoading ? <Loader2 className="w-6 h-6 mr-2 animate-spin shrink-0" /> : null} PAGAR VIA STRIPE
                  </Button>
                </div>
              )}

              {gameSettings?.pix_key && (
                <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-xl flex items-center gap-2 text-amber-700 dark:text-amber-500"><FileWarning className="w-6 h-6" /> PIX Manual</h3>
                    <span className="text-2xl font-black text-amber-700 dark:text-amber-400">R$ {valorCheio.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-dashed border-amber-200 dark:border-amber-800">
                    Sem taxas extras. A liberação não é imediata e exige envio de comprovante.
                  </p>
                  <div className="bg-gray-50 dark:bg-muted/30 p-4 rounded-xl border-2 border-dashed flex flex-col items-center">
                    {pixPayload && <QRCodeSVG value={pixPayload} size={160} className="mb-4 bg-white p-3 rounded-xl shadow-sm border" />}
                    <div className="relative w-full">
                      <Input value={pixPayload ? 'Clique para copiar chave PIX' : 'Erro'} readOnly className="pr-12 text-center cursor-pointer text-sm font-bold h-12" onClick={() => handleCopiarPix(pixPayload)} />
                      <Button size="icon" variant="ghost" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 text-gray-700" onClick={() => handleCopiarPix(pixPayload)} disabled={!pixPayload}><Copy className="w-5 h-5" /></Button>
                        </div>
                        

                         <div className="space-y-3 text-left pt-3">
                      <Label htmlFor="receipt" className="text-sm font-black text-gray-800 dark:text-gray-200">Anexe o Comprovante do PIX:</Label>
                      <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} className="h-12 file:mr-4 file:py-2 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-black file:bg-amber-100 file:text-amber-800 cursor-pointer" />
                      <Button className="w-full h-14 text-lg bg-amber-600 hover:bg-amber-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={handleSubmitManual} disabled={!file || isLoading}>
                         {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Upload className="w-5 h-5 mr-2" />} Enviar para Avaliação
                      </Button>
                  </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="pt-4 pb-2 border-t mt-4">
          <DialogClose asChild><Button variant="outline" className="w-full sm:w-auto h-12 text-base font-bold">Voltar</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
