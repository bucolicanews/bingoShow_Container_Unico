import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Loader2, ShieldCheck, Smartphone, Search } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { FolhaBingoFisico } from '@/types/match';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ThermalBingoTicket } from '@/components/ThermalBingoTicket';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const BASE_URL = window.location.origin;

type PrintFormat = 'a4' | 'thermal_58' | 'thermal_80';

export default function VendedorImprimirBingo() {
  const { folhaId } = useParams<{ folhaId: string }>();
  const navigate = useNavigate();
  const [folhas, setFolhas] = useState<FolhaBingoFisico[]>([]);
  const [loading, setLoading] = useState(true);
  const [printFormat, setPrintFormat] = useState<PrintFormat>('a4');

  useEffect(() => {
    async function loadFolhas() {
      if (!folhaId) return;
      
      const ids = folhaId.split(',').filter(id => id.trim() !== '');
      if (ids.length === 0) return;

      const { data } = await supabase.from('vendas_bingo_fisico').select('*, partidas(name, start_time, game_type), vendedores_rifa(nome, codigo_ref)').in('id', ids).order('created_at', { ascending: false });

      if (data) setFolhas(data as FolhaBingoFisico[]);
      setLoading(false);
    }
    loadFolhas();
  }, [folhaId]);

  const printStyles = {
    a4: `@media print { @page { size: A4 portrait; margin: 10mm; } body { background: white !important; -webkit-print-color-adjust: exact; } .no-print { display: none; } }`,
    thermal_58: `@media print { @page { size: 58mm 300mm; margin: 0; } body { background: white !important; -webkit-print-color-adjust: exact; } .no-print { display: none; } }`,
    thermal_80: `@media print { @page { size: 80mm 300mm; margin: 0; } body { background: white !important; -webkit-print-color-adjust: exact; } .no-print { display: none; } }`,
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-10 h-10 animate-spin text-purple-600" /></div>;
  }

  if (folhas.length === 0) return <div className="text-center py-20 text-muted-foreground">Nenhuma folha de bingo encontrada.</div>;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="print:hidden bg-white border-b px-4 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div><h1 className="font-bold">Impressão de Bilhetes</h1><p className="text-xs text-muted-foreground">{folhas.length} folha(s) carregada(s)</p></div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <Select value={printFormat} onValueChange={(value) => setPrintFormat(value as PrintFormat)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Formato de Impressão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">Folha A4</SelectItem>
              <SelectItem value="thermal_58">Térmica 58mm</SelectItem>
              <SelectItem value="thermal_80">Térmica 80mm</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => window.print()} className="bg-purple-600 hover:bg-purple-700 text-white shadow-sm"><Printer className="h-4 w-4 mr-2" /> Imprimir</Button>
        </div>
      </div>

      {printFormat === 'a4' ? (
        <div className="flex flex-col gap-8 print:gap-0 print:bg-white">
          {folhas.map((folha, index) => {
            const grids = folha.grids;
            const valorCheio = Number(folha.valor_pago) / (1 - (Number(folha.desconto_aplicado || 0) / 100));
            const pagarUrl = `${BASE_URL}/pagar-cartela?codigo=${folha.codigo_validacao}`;
            const conferirUrl = `${BASE_URL}/validar-cartela?bingo=${folha.codigo_validacao}`;
            
            return (
              <div key={folha.id} className={cn("max-w-4xl mx-auto p-4 sm:p-8 print:p-0 w-full", index < folhas.length - 1 && "print:break-after-page")}>
                <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 print:shadow-none print:border-none print:p-0">
                  
                  <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-dashed border-gray-400 pb-4 mb-5 gap-4">
                    <div className="flex flex-col h-full justify-between flex-1 w-full">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-black uppercase text-gray-900 leading-tight">{folha.partidas?.name}</h2>
                        <p className="text-xs sm:text-sm font-bold text-gray-600 mt-1 mb-3">
                          CÓDIGO OFICIAL: <span className="font-mono text-black text-sm sm:text-base ml-1">{folha.codigo_validacao}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="shrink-0 flex flex-col items-center">
                          {folha.vendedores_rifa?.codigo_ref && <QRCodeSVG value={`${BASE_URL}/vendedor/perfil/${folha.vendedores_rifa.codigo_ref}`} size={35} />}
                          <p className="text-[6px] text-gray-400 font-bold mt-1 uppercase">Vendedor</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 text-purple-600">
                            <ShieldCheck className="h-3 w-3" />
                            <span className="text-[8px] font-black uppercase">Vendedor Autorizado</span>
                          </div>
                          <p className="text-[10px] font-bold text-gray-700 truncate">{folha.vendedores_rifa?.nome || 'Desconhecido'}</p>
                          <p className="text-[8px] text-gray-500">Ref: {folha.vendedores_rifa?.codigo_ref} • Emitido: {format(new Date(folha.created_at), "dd/MM/yyyy HH:mm")}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-row gap-2 sm:gap-4 shrink-0 items-start ml-auto sm:ml-0">
                      <div className={cn(
                          "text-center flex flex-col items-center border rounded p-1.5 min-w-[90px] shadow-sm",
                          folha.status === 'pago' ? "border-gray-200 bg-gray-50 opacity-50" : "border-green-600 bg-green-50"
                      )}>
                        <p className="text-[7px] font-black text-green-700 flex items-center gap-1 mb-0.5 uppercase">
                          <Smartphone className="w-2.5 h-2.5" /> {folha.status === 'pago' ? 'PAGAMENTO OK' : 'PAGAR & VALIDAR'}
                        </p>
                        <div className="p-1 bg-white rounded shadow-sm"><QRCodeSVG value={pagarUrl} size={50} /></div>
                        <p className="text-[5px] font-black text-red-600 mt-0.5 uppercase leading-tight">Use a CÂMERA<br/>Não use App Banco</p>
                        {folha.status !== 'pago' && <p className="text-[8px] font-black text-green-900 mt-0.5">R$ {valorCheio.toFixed(2)}</p>}
                      </div>

                      <div className="text-center flex flex-col items-center border border-blue-200 bg-blue-50 rounded p-1.5 min-w-[90px] shadow-sm">
                        <p className="text-[7px] font-black text-blue-700 flex items-center gap-1 mb-0.5 uppercase">
                          <Search className="w-2.5 h-2.5" /> CONFERIR / VALIDAR
                        </p>
                        <div className="p-1 bg-white rounded shadow-sm border border-blue-100">
                          <QRCodeSVG value={conferirUrl} size={50} />
                        </div>
                        <p className="text-[5px] font-bold text-blue-600 mt-0.5 uppercase">Cadastre-se / Ganhe</p>
                      </div>
                    </div>
                  </div>

                  <div className={cn(
                    "grid gap-4 print:gap-2",
                    grids.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-md mx-auto"
                  )}>
                    {grids.map((grid, gridIdx) => (
                      <div key={gridIdx} className="border-2 border-gray-800 rounded-lg p-2 bg-white break-inside-avoid overflow-hidden">
                        <div className="flex justify-between items-center mb-1 px-1">
                          <p className="text-[9px] font-bold text-gray-500">CARTELA {gridIdx + 1}</p>
                          <p className="text-[9px] font-mono text-gray-400">{folha.codigo_validacao}-{gridIdx+1}</p>
                        </div>
                        <table className="w-full text-center border-collapse bg-white table-fixed border-2 border-gray-800">
                          <thead>
                            <tr>
                              {['B', 'I', 'N', 'G', 'O'].map((letra, i) => (
                                <th
                                  key={letra}
                                  className={cn(
                                    "w-1/5 py-1 text-lg sm:text-xl font-black border-2 border-gray-800",
                                    ['bg-blue-100', 'bg-red-100', 'bg-gray-100', 'bg-green-100', 'bg-orange-100'][i]
                                  )}
                                >
                                  {letra}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {grid.map((linha, rowIndex) => (
                              <tr key={rowIndex}>
                                {linha.map((num, colIndex) => {
                                  const isMeio = rowIndex === 2 && colIndex === 2;
                                  return (
                                    <td
                                      key={colIndex}
                                      className={cn(
                                        "py-1.5 text-lg sm:text-2xl font-bold border-2 border-gray-800",
                                        isMeio ? 'bg-gray-100' : 'bg-white'
                                      )}
                                    >
                                      {isMeio ? '★' : num}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 pt-4 border-t border-gray-200 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                    <p>Este bilhete é físico e oficial. Para concorrer, ele precisa ser validado no sistema antes do sorteio.</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 p-4">
          {folhas.map(folha => (
            <ThermalBingoTicket 
              key={folha.id} 
              folha={folha} 
              baseUrl={BASE_URL} 
              format={printFormat as 'thermal_58' | 'thermal_80'} 
            />
          ))}
        </div>
      )}
      <style>{printStyles[printFormat]}</style>
    </div>
  );
}