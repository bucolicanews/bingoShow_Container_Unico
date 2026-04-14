import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Loader2, Ticket, ShieldCheck, Smartphone, Search } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BASE_URL = window.location.origin;

type PrintFormat = 'a4' | 'thermal_58' | 'thermal_80';

interface BilheteData {
  id: string;
  numero: number;
  codigoValidacao: string | null;
  nome_comprador: string | null;
  telefone_comprador: string | null;
  endereco_comprador: string | null;
  status_compra: string;
  valor_final: number;
  rifa: {
    nome: string;
    descricao: string | null;
    data_encerramento: string | null;
    custo_por_numero: number;
  } | null;
  vendedor: {
    nome: string;
    telefone: string | null;
    codigo_ref: string | null;
  } | null;
}

export default function VendedorCartelas() {
  const navigate = useNavigate();
  const { rifaId } = useParams<{ rifaId?: string }>();
  const [searchParams] = useSearchParams();
  const numerosIdsParam = searchParams.get('numeros');
  
  const { user } = useAuth();
  const [bilhetes, setBilhetes] = useState<BilheteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [printFormat, setPrintFormat] = useState<PrintFormat>('a4');

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (!user || (!rifaId && !numerosIdsParam)) { setLoading(false); return; }

      const { data: v } = await supabase
        .from('vendedores_rifa')
        .select('id, nome, telefone, codigo_ref')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .single();
      if (!v) { setLoading(false); return; }

      let query = supabase
        .from('numeros_rifa')
        .select('id, numero, nome_comprador, telefone_comprador, endereco_comprador, rifas(nome, data_encerramento, custo_por_numero)')
        .eq('vendedor_id', v.id)
        .order('numero');

      if (numerosIdsParam) {
        query = query.in('id', numerosIdsParam.split(','));
      } else if (rifaId && rifaId !== 'todas') {
        query = query.eq('rifa_id', rifaId).eq('status', 'reservado');
      }

      const { data: numerosDb } = await query;

      if (!numerosDb || numerosDb.length === 0) { setLoading(false); return; }

      const numeroIds = numerosDb.map(n => n.id);
      const { data: cartelas } = await supabase
        .from('cartelas_rifa')
        .select('id, numero_rifa_id, codigo_validacao, compras_rifa(status, valor_total, numeros)')
        .in('numero_rifa_id', numeroIds);

      const cartelaMap: Record<string, any> = {};
      for (const c of (cartelas ?? [])) {
        cartelaMap[c.numero_rifa_id] = c;
      }

      const lista: BilheteData[] = numerosDb.map(nData => {
        const cartela = cartelaMap[nData.id];
        const compra = cartela?.compras_rifa;
        
        const qtdNums = compra?.numeros?.length || 1;
        const valorUnitario = Number(compra?.valor_total || 0) / qtdNums;

        return {
            id: cartela?.id,
            numero: nData.numero,
            codigoValidacao: cartela?.codigo_validacao ?? null,
            nome_comprador: nData.nome_comprador ?? null,
            telefone_comprador: nData.telefone_comprador ?? null,
            endereco_comprador: nData.endereco_comprador ?? null,
            status_compra: compra?.status || 'pago',
            valor_final: valorUnitario,
            rifa: nData.rifas as any,
            vendedor: { nome: v.nome, telefone: v.telefone, codigo_ref: v.codigo_ref },
        };
      });

      setBilhetes(lista);
      setLoading(false);
    })();
  }, [rifaId, numerosIdsParam, user]);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  };

  const printStyles = {
    a4: `@media print { 
      @page { size: A4 portrait; margin: 10mm; } 
      body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
      .bg-emerald-600 { background-color: #059669 !important; } 
      .text-white { color: white !important; } 
      .bg-gray-50\\/50 { background-color: #f9fafb !important; } 
      .bg-emerald-50 { background-color: #ecfdf5 !important; } 
      .bg-blue-50 { background-color: #eff6ff !important; } 
      .custom-scrollbar { overflow: visible !important; }
    }`,
    thermal_58: `@media print { @page { size: 58mm 300mm; margin: 0; } body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`,
    thermal_80: `@media print { @page { size: 80mm 300mm; margin: 0; } body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`,
  };

  const rifaInfo = bilhetes[0]?.rifa;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="print:hidden bg-white border-b px-3 py-3 flex flex-wrap items-center justify-between sticky top-0 z-10 shadow-sm gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight">Impressão de Bilhetes</h1>
            {rifaInfo && <p className="text-xs text-muted-foreground truncate">{rifaInfo.nome} · {bilhetes.length} bilhete(s)</p>}
          </div>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Select value={printFormat} onValueChange={(value) => setPrintFormat(value as PrintFormat)}>
            <SelectTrigger className="w-full sm:w-[160px] h-9 text-xs font-semibold">
              <SelectValue placeholder="Formato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">Folha A4</SelectItem>
              <SelectItem value="thermal_58">Térmica 58mm</SelectItem>
              <SelectItem value="thermal_80">Térmica 80mm</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => window.print()} className="gradient-primary shrink-0 h-9 text-xs px-4 font-bold shadow-sm">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </div>

      <div className="p-4 print:p-0">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : bilhetes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground print:hidden">
            <Ticket className="h-10 w-10 opacity-30" />
            <p>Nenhum bilhete encontrado para impressão.</p>
          </div>
        ) : (
          <>
            {printFormat === 'a4' ? (
              /* ======================= LAYOUT A4 ======================= */
              /* Envolto em overflow-x-auto para rolar no celular sem quebrar o layout */
              <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
                <div className="flex flex-col gap-4 print:gap-2 min-w-[700px] max-w-4xl mx-auto print:max-w-none print:mx-0">
                  {bilhetes.map((b, idx) => {
                    const pagarUrl = `${BASE_URL}/pagar-cartela?codigo=${b.codigoValidacao}`;
                    const conferirUrl = `${BASE_URL}/validar-cartela?codigo=${b.codigoValidacao}`;
                    
                    const isPendente = b.status_compra === 'pendente';
                    const isPago = b.status_compra === 'pago';
                    const isEmAnalise = b.status_compra === 'em_analise';

                    return (
                      <div key={`${b.numero}-${idx}`} className="print:break-inside-avoid">
                        <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-300 print:shadow-none print:border-gray-400 print:rounded-none flex h-[190px] relative">
                          
                          {/* Marca d'água de Status */}
                          {isPago && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 overflow-hidden">
                              <p className="text-6xl font-black text-green-600/15 border-8 border-green-600/15 p-4 rounded-xl rotate-[-25deg] uppercase tracking-tighter whitespace-nowrap">
                                JÁ FOI PAGO
                              </p>
                            </div>
                          )}
                          
                          {isEmAnalise && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 overflow-hidden">
                              <p className="text-5xl font-black text-blue-600/20 border-8 border-blue-600/20 p-4 rounded-xl rotate-[-25deg] uppercase tracking-tighter whitespace-nowrap">
                                EM ANÁLISE
                              </p>
                            </div>
                          )}

                          {/* Faixa Esquerda (Verde) */}
                          <div className="bg-emerald-600 flex flex-col items-center justify-center px-2 shrink-0 text-white w-12">
                            <p className="text-[7px] uppercase font-bold rotate-180 [writing-mode:vertical-lr] tracking-widest opacity-90">Bilhete Oficial</p>
                            <p className="text-xl font-black font-mono mt-3 rotate-180 [writing-mode:vertical-lr]">{String(b.numero).padStart(3, '0')}</p>
                          </div>

                          {/* Corpo Principal do Bilhete */}
                          <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                            
                            {/* Linha Superior: Título + QRs */}
                            <div className="flex justify-between items-start gap-4">
                              <div className="min-w-0 flex-1">
                                <h2 className="text-lg font-black text-gray-800 uppercase truncate leading-tight">{b.rifa?.nome}</h2>
                                <p className="text-[10px] text-gray-500 font-bold mt-1">CÓDIGO: <span className="text-gray-800 font-mono text-xs">{b.codigoValidacao}</span></p>
                              </div>
                              
                              <div className="flex gap-2 shrink-0">
                                {/* Caixa Pagar */}
                                <div className={cn(
                                    "text-center flex flex-col items-center justify-center border rounded p-1 w-[70px] shadow-sm",
                                    isPago ? "border-gray-200 bg-gray-50 opacity-50" : isEmAnalise ? "border-blue-200 bg-blue-50" : "border-emerald-500 bg-emerald-50"
                                )}>
                                  <p className={cn("text-[6px] font-black flex items-center gap-0.5 mb-1 uppercase", isPago ? "text-gray-500" : isEmAnalise ? "text-blue-700" : "text-emerald-700")}>
                                    {isPago ? 'PAGO' : isEmAnalise ? 'ANÁLISE' : 'PAGAR (PIX)'}
                                  </p>
                                  <div className="p-0.5 bg-white rounded shadow-sm">
                                    <QRCodeSVG value={pagarUrl} size={42} />
                                  </div>
                                </div>

                                {/* Caixa Conferir */}
                                <div className="text-center flex flex-col items-center justify-center border border-blue-200 bg-blue-50 rounded p-1 w-[70px] shadow-sm">
                                  <p className="text-[6px] font-black text-blue-700 flex items-center gap-0.5 mb-1 uppercase">
                                    CONFERIR
                                  </p>
                                  <div className="p-0.5 bg-white rounded shadow-sm border border-blue-100">
                                    <QRCodeSVG value={conferirUrl} size={42} />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Informações Data e Valor */}
                            <div className="grid grid-cols-2 gap-4 border-y border-gray-100 py-2 my-2">
                              <div>
                                <p className="text-[8px] text-gray-400 uppercase font-bold">Data do Sorteio</p>
                                <p className="text-xs font-bold text-gray-700">{formatDate(b.rifa?.data_encerramento ?? null)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[8px] text-gray-400 uppercase font-bold">Valor da Cota</p>
                                <p className="text-sm font-black text-emerald-600">R$ {Number(b.rifa?.custo_por_numero).toFixed(2)}</p>
                              </div>
                            </div>

                            {/* Vendedor Info */}
                            <div className="flex items-center gap-3">
                              <div className="shrink-0 flex flex-col items-center">
                                {b.vendedor?.codigo_ref && (
                                  <div className="bg-white p-0.5 border border-gray-200 rounded">
                                    <QRCodeSVG value={`${BASE_URL}/vendedor/perfil/${b.vendedor.codigo_ref}`} size={38} />
                                  </div>
                                )}
                                <p className="text-[6px] text-gray-400 font-bold mt-1 uppercase">Vendedor</p>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 text-emerald-600 mb-0.5">
                                  <ShieldCheck className="h-3 w-3" />
                                  <span className="text-[8px] font-black uppercase tracking-wide">Vendedor Autorizado</span>
                                </div>
                                <p className="text-[11px] font-bold text-gray-800 truncate">{b.vendedor?.nome}</p>
                                <p className="text-[8px] text-gray-500">Ref: {b.vendedor?.codigo_ref}</p>
                              </div>
                            </div>
                          </div>

                          {/* Linha Tracejada Divisória */}
                          <div className="w-0 border-l-2 border-dashed border-gray-300 relative shrink-0">
                            <div className="absolute -top-2 -left-2 w-4 h-4 bg-gray-100 rounded-full border border-gray-300 print:bg-white" />
                            <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-gray-100 rounded-full border border-gray-300 print:bg-white" />
                          </div>

                          {/* Canhoto do Vendedor */}
                          <div className="w-[210px] bg-gray-50/80 p-3 flex flex-col shrink-0 justify-between">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-[9px] font-black text-gray-400 uppercase pt-1 tracking-widest">Canhoto</p>
                              <p className="text-sm font-black font-mono text-gray-800">Nº {String(b.numero).padStart(3, '0')}</p>
                            </div>

                            <div className="flex gap-2 justify-center mb-2">
                              {/* QR Pagar Canhoto */}
                              <div className={cn(
                                  "text-center flex flex-col items-center justify-center border rounded p-1 w-[65px] shadow-sm bg-white",
                                  isPago ? "border-gray-200 opacity-50" : isEmAnalise ? "border-blue-200" : "border-emerald-500"
                              )}>
                                <p className={cn("text-[5px] font-black uppercase mb-1", isPago ? "text-gray-500" : isEmAnalise ? "text-blue-700" : "text-emerald-700")}>
                                  {isPago ? 'PAGO' : isEmAnalise ? 'ANÁLISE' : 'PAGAR'}
                                </p>
                                <QRCodeSVG value={pagarUrl} size={38} />
                              </div>

                              {/* QR Conferir Canhoto */}
                              <div className="text-center flex flex-col items-center justify-center border border-blue-200 bg-white rounded p-1 w-[65px] shadow-sm">
                                <p className="text-[5px] font-black text-blue-700 uppercase mb-1">CONFERIR</p>
                                <QRCodeSVG value={conferirUrl} size={38} />
                              </div>
                            </div>

                            <div className="space-y-2 mt-auto">
                              <div className="border-b border-gray-400 border-dashed pb-0.5">
                                <p className="text-[7px] text-gray-500 uppercase font-bold">Nome Comprador</p>
                                <div className="h-3 text-[10px] font-bold text-gray-800 truncate">{b.nome_comprador || ''}</div>
                              </div>
                              <div className="border-b border-gray-400 border-dashed pb-0.5">
                                <p className="text-[7px] text-gray-500 uppercase font-bold">Telefone / WhatsApp</p>
                                <div className="h-3 text-[10px] font-bold text-gray-800 truncate">{b.telefone_comprador || ''}</div>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ======================= LAYOUT TÉRMICO (58mm e 80mm) ======================= */
              <div className="flex flex-col items-center gap-4 print:gap-0 print:p-0">
                {bilhetes.map((b, idx) => {
                  const widthClass = printFormat === 'thermal_58' ? 'w-[54mm]' : 'w-[76mm]';
                  const pagarUrl = `${BASE_URL}/pagar-cartela?codigo=${b.codigoValidacao}`;
                  const conferirUrl = `${BASE_URL}/validar-cartela?codigo=${b.codigoValidacao}`;
                  const isPago = b.status_compra === 'pago';
                  const isEmAnalise = b.status_compra === 'em_analise';
                  const isPendente = b.status_compra === 'pendente';

                  return (
                    <div key={`${b.numero}-${idx}`} className={cn("bg-white text-black font-mono p-2 break-after-page", widthClass)}>
                      <div className="text-center mb-2 border-b-2 border-black pb-2">
                        <h1 className="font-bold text-sm uppercase leading-tight">{b.rifa?.nome}</h1>
                        <p className="text-[10px] mt-1">Sorteio: {formatDate(b.rifa?.data_encerramento ?? null)}</p>
                      </div>

                      <div className="border-2 border-black rounded-lg my-2 py-2 text-center bg-gray-100">
                        <p className="text-[10px] uppercase font-bold mb-1">NÚMERO DA SORTE</p>
                        <p className="font-black text-4xl tracking-widest">{String(b.numero).padStart(3, '0')}</p>
                        <p className="text-[9px] mt-1 font-bold">CÓD: {b.codigoValidacao}</p>
                      </div>

                      <div className="text-[10px] space-y-1 mb-3 border-b-2 border-dashed border-black pb-2 text-left">
                        <p><span className="font-bold uppercase">Cliente:</span> {b.nome_comprador || 'Não informado'}</p>
                        <p><span className="font-bold uppercase">Contato:</span> {b.telefone_comprador || 'Não informado'}</p>
                        <p><span className="font-bold uppercase">Valor Cota:</span> R$ {Number(b.valor_final).toFixed(2)}</p>
                      </div>

                      {isPago && (
                        <div className="text-center border-2 border-black p-1.5 mb-3 bg-gray-200">
                           <p className="font-black text-sm uppercase">PAGAMENTO OK</p>
                        </div>
                      )}

                      {isEmAnalise && (
                        <div className="text-center border-2 border-black p-1.5 mb-3 bg-gray-100">
                           <p className="font-black text-sm uppercase">EM ANÁLISE</p>
                        </div>
                      )}

                      {!isPago && !isEmAnalise && (
                        <div className="mb-3 text-center border-b-2 border-dashed border-black pb-2">
                          <p className="text-[10px] font-bold uppercase mb-1">PAGAR E VALIDAR (PIX)</p>
                          <div className="flex justify-center p-1">
                            <QRCodeSVG value={pagarUrl} size={110} />
                          </div>
                          <p className="font-black text-sm mt-1">R$ {b.valor_final.toFixed(2)}</p>
                        </div>
                      )}

                      <div className="text-center">
                        <p className="text-[10px] font-bold uppercase mb-1">CONFERIR / VALIDAR</p>
                        <div className="flex justify-center p-1">
                          <QRCodeSVG value={conferirUrl} size={80} />
                        </div>
                      </div>

                      {b.vendedor?.codigo_ref && (
                        <div className="mt-2 border-t-2 border-dashed border-black pt-2 text-center">
                          <p className="text-[10px] font-bold uppercase mb-1">Vendedor Autorizado</p>
                          <div className="flex justify-center p-1">
                            <QRCodeSVG value={`${BASE_URL}/vendedor/perfil/${b.vendedor.codigo_ref}`} size={80} />
                          </div>
                          <p className="text-[10px] font-bold mt-1 uppercase">{b.vendedor.nome}</p>
                          <p className="text-[8px]">Ref: {b.vendedor.codigo_ref}</p>
                        </div>
                      )}

                      <div className="border-t-2 border-black mt-2 pt-2 text-[9px] text-center leading-tight">
                        {!b.vendedor?.codigo_ref && (
                          <>
                            <p className="font-bold uppercase">Vendedor: {b.vendedor?.nome || 'N/A'}</p>
                            <p>Ref: {b.vendedor?.codigo_ref}</p>
                          </>
                        )}
                        <p className="mt-1 uppercase font-bold text-[8px]">Guarde este bilhete oficial.</p>
                        <p className="text-[8px]">Valide-o no sistema antes do sorteio.</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <style>{printStyles[printFormat]}</style>
    </div>
  );
}