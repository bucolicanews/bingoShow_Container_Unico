import { CompraRifa } from '@/types/rifa';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ThermalRifaTicketProps {
  compra: CompraRifa;
  baseUrl: string;
  format: 'thermal_58' | 'thermal_80';
}

export function ThermalRifaTicket({ compra, baseUrl, format }: ThermalRifaTicketProps) {
  const rifaUrl = `${baseUrl}/rifa/${compra.rifa_id}`;
  const widthClass = format === 'thermal_58' ? 'w-[54mm]' : 'w-[76mm]';

  return (
    <div className={cn("bg-white text-black font-mono p-1", widthClass)}>
      <div className="text-center mb-2">
        <h1 className="font-bold text-sm uppercase">{compra.rifas.nome}</h1>
        <p className="text-xs">Sorteio: {format(new Date(compra.rifas.data_sorteio), "dd/MM/yyyy")}</p>
      </div>

      <div className="border-y-2 border-dashed border-black my-2 py-2 text-center">
        <p className="text-xs uppercase">Seus Números da Sorte</p>
        <div className="flex flex-wrap justify-center gap-1 p-2">
          {compra.numeros.map(n => (
            <span key={n} className="font-bold text-lg">{n}</span>
          ))}
        </div>
      </div>
      
      <div className="text-xs space-y-1 my-2">
        <p><span className="font-bold">Cliente:</span> {compra.clientes_rifa?.nome || 'Não identificado'}</p>
        <p><span className="font-bold">Valor:</span> R$ {compra.valor_total.toFixed(2)}</p>
        <p><span className="font-bold">Vendedor:</span> {compra.vendedores_rifa.nome}</p>
        <p><span className="font-bold">Data:</span> {format(new Date(compra.created_at), "dd/MM/yy HH:mm")}</p>
      </div>

      <div className="mt-2 text-center">
        <p className="text-xs uppercase">Acompanhe a Rifa</p>
        <div className="flex justify-center p-1">
          <QRCodeSVG value={rifaUrl} size={120} />
        </div>
      </div>

      <div className="border-t-2 border-dashed border-black mt-2 pt-2 text-[8px] text-center">
        <p>Guarde este comprovante. Boa sorte!</p>
      </div>
    </div>
  );
}
