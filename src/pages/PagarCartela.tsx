import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Copy, CheckCircle2, AlertTriangle, ShieldCheck, Camera, CreditCard, SmartphoneNfc, User, FileWarning } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCodePix } from 'qrcode-pix';
import { toast } from 'sonner';

export default function PagarCartela() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codigo = searchParams.get('codigo');
  const paymentStatus = searchParams.get('payment');

  const [venda, setVenda] = useState<any | null>(null);
  const [tipoVenda, setTipoVenda] = useState<'bingo' | 'rifa' | null>(null);
  const [gameSettings, setGameSettings] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  
  // PagBank States
  const [isPagbankLoading, setIsPagbankLoading] = useState(false);
  const [pagbankData, setPagbankData] = useState<{qr_code: string, qr_code_text: string} | null>(null);
  const [nomePagador, setNomePagador] = useState('');
  const [telefonePagador, setTelefonePagador] = useState('');
  const [cpfPagador, setCpfPagador] = useState('');

  useEffect(() => {
    async function loadData() {
      if (!codigo) { setLoading(false); return; }
      await supabase.rpc('preparar_cartela_para_pagamento', { p_codigo: codigo.toUpperCase().trim() });
      const { data: resConfig } = await supabase.from('configuracoes').select('*').single();
      if (resConfig) setGameSettings(resConfig);

      const { data: resBingo } = await supabase.from('vendas_bingo_fisico').select('*, partidas(name)').eq('codigo_validacao', codigo.toUpperCase().trim()).maybeSingle();
      if (resBingo) {
        setVenda(resBingo); setTipoVenda('bingo');
        if (resBingo.nome_comprador) setNomePagador(resBingo.nome_comprador);
        if (resBingo.telefone_comprador) setTelefonePagador(resBingo.telefone_comprador);
        setLoading(false); return;
      }

      const { data: resRifa } = await supabase.from('cartelas_rifa').select('*, compras_rifa(*, rifas(nome)), numeros_rifa(nome_comprador, telefone_comprador)').eq('codigo_validacao', codigo.toUpperCase().trim()).maybeSingle();
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
  }, [codigo]);

  useEffect(() => {
    if (paymentStatus === 'success' && codigo && tipoVenda) {
      toast.success("Pagamento confirmado via Cartão! Agora só falta preencher seus dados.");
      navigate(`/validar-cartela?${tipoVenda === 'rifa' ? 'codigo' : 'bingo'}=${codigo}`, { replace: true });
    }
  }, [paymentStatus, codigo, tipoVenda, navigate]);

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
      const cleanName = (gameSettings.pix_name || 'BINGOSHOW').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '').toUpperCase();
      const cleanCity = (gameSettings.pix_city || 'SAOPAULO').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '').toUpperCase();
      return QrCodePix({ version: '01', key: cleanKey, name: cleanName, city: cleanCity, value: parseFloat(valorCheio.toFixed(2)) }).payload();
    } catch (e) { return ''; }
  }, [gameSettings, venda, valorCheio]);

  const handleCopiarPix = (textToCopy: string) => {
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      toast.success('Código copiado!');
    }
  };

  const handlePagbankPayment = async (method: 'pix' | 'CREDIT_CARD') => {
    if (!nomePagador.trim() || !telefonePagador.trim() || !cpfPagador.trim()) {
      toast.error("Por favor, preencha Nome, WhatsApp e CPF para identificar sua cartela.");
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
           toast.info("A página de pagamento foi aberta em uma nova aba.");
        } else if (method === 'pix' && data.qr_code) { 
           setPagbankData({ qr_code: data.qr_code, qr_code_text: data.qr_code_text }); 
           toast.success("PIX Gerado! Realize o pagamento."); 
        }
      } else {
        if (data?.error?.includes('CPF_REQUIRED')) toast.error("CPF Inválido. Digite um CPF correto com 11 números.");
        else throw new Error(data?.error || "Erro na geração.");
      }
    } catch (e: any) {
      if (e.message === 'Failed to fetch' || e.message.includes('NetworkError')) toast.error("Sua conexão de internet falhou. Verifique seu sinal e tente novamente.");
      else toast.error("Erro do Banco: " + e.message);
    } finally {
      setIsPagbankLoading(false); setIsStripeLoading(false);
    }
  };

  const handleStripePayment = async () => {
    setIsStripeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-session', {
        body: { amount: finalStripeAmount, type: tipoVenda === 'bingo' ? 'venda_bingo' : 'venda_rifa', metadata: { venda_id: venda.id, codigo: venda.codigo_validacao, origin: window.location.origin } }
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank', 'noreferrer,noopener');
    } catch (e: any) { toast.error("Erro ao iniciar pagamento: " + e.message); } finally { setIsStripeLoading(false); }
  };

  if (loading) return <div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!venda) return <div className="card-container border-2 text-center py-20 max-w-lg mx-auto mt-10 bg-white shadow-xl"><AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4 opacity-70" /><h2 className="text-3xl font-black mb-2">Código Inválido</h2><p className="text-lg text-gray-600 mb-8">Não encontramos este bilhete.</p><Button className="h-14 px-8 text-lg font-bold" onClick={() => navigate('/')}>Voltar ao Início</Button></div>;
  if (venda.status === 'pago') return <div className="card-container border-2 text-center py-20 max-w-lg mx-auto mt-10 border-success bg-success/10 shadow-xl"><CheckCircle2 className="w-20 h-20 text-success mx-auto mb-4" /><h2 className="text-3xl font-black text-success mb-4">Pagamento Confirmado!</h2><Button className="w-full h-14 text-lg font-black bg-success hover:bg-success/90" onClick={() => navigate(`/validar-cartela?${tipoVenda === 'rifa' ? 'codigo' : 'bingo'}=${venda.codigo_validacao}`)}>Conferir Minha Cartela</Button></div>;
  if (venda.status === 'em_analise') return <div className="card-container border-2 text-center py-20 max-w-lg mx-auto mt-10 border-blue-400 bg-blue-50 shadow-xl"><ShieldCheck className="w-20 h-20 text-blue-600 mx-auto mb-4" /><h2 className="text-3xl font-black text-blue-800 mb-4">Em Análise</h2><p className="text-lg text-blue-700 mb-8 font-medium">Seu pagamento está sendo verificado.</p><Button variant="outline" className="w-full h-14 text-lg font-bold border-2 border-blue-400 text-blue-800" onClick={() => navigate('/')}>Voltar ao Início</Button></div>;

  return (
    <div className="max-w-lg mx-auto space-y-6 pt-6 pb-20 px-4">
      <div className="text-center space-y-3">
        <h1 className="font-heading text-3xl md:text-4xl font-black text-foreground">Pagamento do Bilhete</h1>
        <p className="text-gray-600 dark:text-gray-300 text-base font-medium">Siga as instruções abaixo para ativar sua cartela e concorrer.</p>
      </div>

      <div className="card-container border-2 border-primary/30 shadow-2xl p-0 overflow-hidden bg-white dark:bg-card rounded-2xl">
        <div className="bg-primary/10 p-5 text-center border-b-2 border-primary/20">
           <p className="text-lg font-black text-primary uppercase tracking-wider mb-2">{venda.partidas?.name}</p>
           <p className="text-sm font-mono bg-white dark:bg-background inline-block px-4 py-2 rounded-lg border-2 font-black shadow-sm text-gray-800 dark:text-gray-200">CÓDIGO: {venda.codigo_validacao}</p>
        </div>

        <div className="p-5 space-y-8">
          {gameSettings?.pagbank_enabled ? (
             <div className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-950/20 p-5 border-2 border-blue-200 dark:border-blue-800 rounded-2xl space-y-4 shadow-sm">
                  <p className="text-base uppercase font-black text-blue-800 dark:text-blue-400 flex items-center gap-2 border-b-2 border-blue-200 dark:border-blue-800/50 pb-2">
                    <User className="w-5 h-5" /> Identificação Obrigatória
                  </p>
                  <div className="space-y-2"><Label className="text-sm font-bold text-gray-800 dark:text-gray-200">Seu Nome Completo</Label><Input value={nomePagador} onChange={e => setNomePagador(e.target.value)} className="h-12 text-base font-medium bg-white dark:bg-background border-2 border-blue-200 dark:border-blue-800" /></div>
                  <div className="space-y-2"><Label className="text-sm font-bold text-gray-800 dark:text-gray-200">Seu WhatsApp</Label><Input value={telefonePagador} onChange={e => setTelefonePagador(e.target.value)} type="tel" className="h-12 text-base font-medium bg-white dark:bg-background border-2 border-blue-200 dark:border-blue-800" /></div>
                  <div className="space-y-2"><Label className="text-sm font-bold text-gray-800 dark:text-gray-200">Seu CPF *</Label><Input value={cpfPagador} onChange={e => setCpfPagador(e.target.value)} placeholder="Apenas números" className="h-14 text-lg font-bold bg-white dark:bg-background border-2 border-blue-400 dark:border-blue-600 shadow-inner" /></div>
                </div>

                <div className="space-y-5 pt-2">
                   <div className="flex items-center gap-3 text-base font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest before:flex-1 before:border-t-2 after:flex-1 after:border-t-2">
                     Opções de Pagamento
                   </div>

                   {/* Cartão Checkout */}
                   <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-xl flex items-center gap-2 text-blue-700 dark:text-blue-500"><CreditCard className="w-6 h-6"/> Cartão</span>
                        <span className="font-black text-2xl text-blue-700 dark:text-blue-400">R$ {(cardFeeDetails?.final || valorCheio).toFixed(2).replace('.', ',')}</span>
                      </div>
                      {cardFeeDetails && <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-muted/50 p-3 rounded-lg border border-dashed">Acréscimo de <strong>R$ {cardFeeDetails.fee.toFixed(2)}</strong> ref. a taxa de serviço do cartão.</p>}
                      <Button className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={() => handlePagbankPayment('CREDIT_CARD')} disabled={isStripeLoading || valorCheio <= 0}>
                         {isStripeLoading ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : null} Pagar no Cartão Seguro
                      </Button>
                   </div>

                   {/* PIX PagBank */}
                   <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-xl flex items-center gap-2 text-green-700 dark:text-green-500"><SmartphoneNfc className="w-6 h-6"/> PIX Rápido</span>
                        <span className="font-black text-2xl text-green-700 dark:text-green-400">R$ {(pixFeeDetails?.final || valorCheio).toFixed(2).replace('.', ',')}</span>
                      </div>
                      {!pagbankData ? (
                        <div className="space-y-4 w-full">
                          {pixFeeDetails && <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-muted/50 p-3 rounded-lg border border-dashed">Inclui taxa bancária de R$ {pixFeeDetails.fee.toFixed(2)}.</p>}
                          <Button className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={() => handlePagbankPayment('pix')} disabled={isPagbankLoading || valorCheio <= 0}>
                              {isPagbankLoading ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : null} Gerar QR Code PIX
                          </Button>
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
             </div>
          ) : null}

          {/* STRIPE CARTÃO (Agora renderiza independente do PagBank) */}
          {gameSettings?.stripe_enabled && (
            <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-4 mt-6">
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

          {/* PIX MANUAL FALLBACK */}
          {gameSettings?.pix_key && (
             <div className="bg-white dark:bg-card p-5 rounded-2xl border-2 border-gray-200 shadow-md space-y-5 mt-6">
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
                        <Input value={pixPayload ? "Clique para copiar chave PIX" : "Erro"} readOnly className="pr-12 text-center cursor-pointer text-sm font-bold h-12" onClick={() => handleCopiarPix(pixPayload)} />
                        <Button size="icon" variant="ghost" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 text-gray-700" onClick={() => handleCopiarPix(pixPayload)} disabled={!pixPayload}><Copy className="w-5 h-5" /></Button>
                    </div>
                </div>

                <div className="space-y-3 text-left pt-3">
                    <Label htmlFor="receipt" className="text-sm font-black text-gray-800 dark:text-gray-200">Anexe o Comprovante do PIX:</Label>
                    <Input type="file" accept="image/*,application/pdf" className="h-12 file:mr-4 file:py-2 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-black file:bg-amber-100 file:text-amber-800 cursor-pointer" />
                    <Button className="w-full h-14 text-lg bg-amber-600 hover:bg-amber-700 text-white font-black shadow-lg hover:scale-[1.02] transition-transform" onClick={() => navigate(`/validar-cartela?${tipoVenda === 'rifa' ? 'codigo' : 'bingo'}=${venda.codigo_validacao}`)}>
                      <Camera className="w-6 h-6 mr-2" /> Enviar Comprovante
                    </Button>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}