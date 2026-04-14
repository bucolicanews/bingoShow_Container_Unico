import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PrintFormat = 'a4' | 'thermal_58' | 'thermal_80';

export default function VendedorImprimirRifa() {
  console.log('TELA RIFA CARREGADA');

  const { folhaId } = useParams<{ folhaId: string }>();
  const navigate = useNavigate();

  const [folhas, setFolhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [printFormat, setPrintFormat] = useState<PrintFormat>('a4');

  useEffect(() => {
    async function loadFolhas() {
      if (!folhaId) return;

      const ids = folhaId.split(',').filter(id => id.trim() !== '');
      if (ids.length === 0) return;

      const { data, error } = await supabase
        .from('vendas_rifa')
        .select('*')
        .in('id', ids);

      if (!error && data) setFolhas(data);

      setLoading(false);
    }

    loadFolhas();
  }, [folhaId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">

      {/* HEADER */}
      <div className="print:hidden bg-white border-b px-4 py-3 flex justify-between items-center shadow-sm">

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>

             
        </div>

        <div className="flex gap-3">

          <Select value={printFormat} onValueChange={(v) => setPrintFormat(v as PrintFormat)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">A4</SelectItem>
              <SelectItem value="thermal_58">58mm</SelectItem>
              <SelectItem value="thermal_80">80mm</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>

        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="p-4 print:p-0">

        {printFormat === 'a4' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

            {folhas.map((folha) => (
              <div key={folha.id} className="bg-white border p-4 rounded text-sm break-inside-avoid">

                <h2 className="text-center font-bold">RIFA</h2>
                <p className="text-center text-xs mb-2">Nº {folha.numero}</p>

                <p><strong>Cliente:</strong> {folha.nome}</p>
                <p><strong>Status:</strong> {folha.status}</p>
                <p><strong>Valor:</strong> R$ {Number(folha.valor || 0).toFixed(2)}</p>

                <p className="text-center mt-2 text-xs">Boa sorte!</p>

              </div>
            ))}

          </div>
        )}

        {printFormat === 'thermal_58' && (
          <div className="flex flex-col items-center text-[10px]">
            {folhas.map((folha) => (
              <div key={folha.id} className="w-[58mm] text-center mb-3">
                <p className="font-bold">RIFA</p>
                <p>Nº {folha.numero}</p>
                <p>{folha.nome}</p>
                <p>R$ {Number(folha.valor || 0).toFixed(2)}</p>
                <p>{folha.status}</p>
              </div>
            ))}
          </div>
        )}

        {printFormat === 'thermal_80' && (
          <div className="flex flex-col items-center text-xs">
            {folhas.map((folha) => (
              <div key={folha.id} className="w-[80mm] text-center mb-3">
                <p className="font-bold text-lg">RIFA</p>
                <p>{folha.numero}</p>
                <p>{folha.nome}</p>
                <p>R$ {Number(folha.valor || 0).toFixed(2)}</p>
                <p>{folha.status}</p>
              </div>
            ))}
          </div>
        )}

      </div>

      <style>{`
        @media print {
          .break-inside-avoid {
            break-inside: avoid;
          }
        }
      `}</style>

    </div>
  );
}