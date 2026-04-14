import { FolhaBingoFisico } from '@/types/match';
import { QRCodeSVG } from 'qrcode.react';
import { format as formatDate } from 'date-fns';
import { cn } from '@/lib/utils';

interface ThermalBingoTicketProps {
  folha: FolhaBingoFisico;
  baseUrl: string;
  format: 'thermal_58' | 'thermal_80';
}

export function ThermalBingoTicket({ folha, baseUrl, format }: ThermalBingoTicketProps) {
  const pagarUrl = `${baseUrl}/pagar-cartela?codigo=${folha.codigo_validacao}`;
  const conferirUrl = `${baseUrl}/validar-cartela?bingo=${folha.codigo_validacao}`;
  const vendedorUrl = folha.vendedores_rifa?.codigo_ref ? `${baseUrl}/vendedor/perfil/${folha.vendedores_rifa.codigo_ref}` : null;
  const valorCheio = Number(folha.valor_pago) / (1 - (Number(folha.desconto_aplicado || 0) / 100));

  const widthClass = format === 'thermal_58' ? 'w-[54mm]' : 'w-[76mm]';

  return (
    <div className={cn("bg-white text-black font-mono p-1 break-after-page", widthClass)}>
      <div className="text-center mb-2 border-b-2 border-black pb-2">
        <h1 className="font-bold text-sm uppercase leading-tight">{folha.partidas?.name}</h1>
        <p className="text-[10px] mt-1">
          Sorteio: {formatDate(new Date(folha.partidas?.start_time || ''), "dd/MM/yyyy 'às' HH:mm")}
        </p>
      </div>

      <div className="border-2 border-black rounded-lg my-2 py-2 text-center bg-gray-100">
        <p className="text-[10px] uppercase font-bold mb-1">CÓDIGO DO BILHETE</p>
        <p className="font-black text-xl tracking-widest">{folha.codigo_validacao}</p>
      </div>

      {folha.grids.map((grid, gridIdx) => (
        <div key={gridIdx} className="mb-2 break-inside-avoid">
          <p className="text-center font-bold text-[10px] mb-1">CARTELA {gridIdx + 1}</p>
          <table className="w-full text-center border-collapse table-fixed border-2 border-black">
            <thead>
              <tr>
                {['B', 'I', 'N', 'G', 'O'].map((letra) => (
                  <th key={letra} className="w-1/5 py-0.5 text-[10px] font-bold border border-black bg-gray-200">
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
                      <td key={colIndex} className="py-0.5 text-[11px] font-bold border border-black h-[16px]">
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

      {folha.status !== 'pago' && (
        <div className="mt-3 text-center border-t-2 border-dashed border-black pt-2">
          <p className="text-[10px] font-bold uppercase mb-1">Pagar e Validar (PIX)</p>
          <div className="flex justify-center p-1">
            <QRCodeSVG value={pagarUrl} size={100} />
          </div>
          <p className="font-black text-sm mt-1">R$ {valorCheio.toFixed(2)}</p>
        </div>
      )}

      {folha.status === 'pago' && (
        <div className="text-center border-2 border-black p-1.5 mt-3 mb-2 bg-gray-200">
            <p className="font-black text-sm uppercase">PAGAMENTO OK</p>
        </div>
      )}

      <div className="mt-2 text-center border-t-2 border-dashed border-black pt-2">
        <p className="text-[10px] font-bold uppercase mb-1">Conferir / Validar Cartela</p>
        <div className="flex justify-center p-1">
          <QRCodeSVG value={conferirUrl} size={80} />
        </div>
      </div>

      {/* QR Code Vendedor */}
      {vendedorUrl && (
        <div className="mt-2 text-center border-t-2 border-dashed border-black pt-2">
          <p className="text-[10px] font-bold uppercase mb-1">Vendedor Autorizado</p>
          <div className="flex justify-center p-1">
            <QRCodeSVG value={vendedorUrl} size={80} />
          </div>
          <p className="text-[10px] font-bold mt-1 uppercase">{folha.vendedores_rifa?.nome}</p>
          <p className="text-[8px]">Ref: {folha.vendedores_rifa?.codigo_ref}</p>
        </div>
      )}

      <div className="border-t-2 border-black mt-2 pt-2 text-[9px] text-center leading-tight">
        {!vendedorUrl && (
          <>
            <p className="font-bold uppercase">Vendedor: {folha.vendedores_rifa?.nome || 'N/A'}</p>
            <p>Ref: {folha.vendedores_rifa?.codigo_ref}</p>
          </>
        )}
        <p className="mt-1 uppercase font-bold text-[8px]">Guarde este bilhete oficial.</p>
        <p className="text-[8px]">Valide-o no sistema antes do sorteio.</p>
        <p className="mt-1 text-[8px]">Emitido: {formatDate(new Date(folha.created_at), "dd/MM/yy HH:mm")}</p>
      </div>
    </div>
  );
}