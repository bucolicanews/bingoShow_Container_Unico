import { CompraRifa } from '@/types/rifa';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';

interface A4RifaTicketProps {
  compra: CompraRifa;
  baseUrl: string;
}

export function A4RifaTicket({ compra, baseUrl }: A4RifaTicketProps) {
  const rifaUrl = `${baseUrl}/rifa/${compra.rifa_id}`;

  return (
    <div className="max-w-2xl mx-auto p-8">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200">
            <div className="text-center border-b-2 border-dashed pb-6 mb-6">
                <h1 className="text-3xl font-black uppercase text-gray-800">{compra.rifas.nome}</h1>
                <p className="text-lg font-bold text-purple-600 mt-2">Prêmio: {compra.rifas.premio}</p>
                <p className="text-md text-gray-500">Sorteio em: {format(new Date(compra.rifas.data_sorteio), "dd/MM/yyyy")}</p>
            </div>

            <div className="mb-6">
                <p className="text-sm uppercase font-bold text-gray-500 mb-2">Seus números</p>
                <div className="flex flex-wrap gap-3 justify-center">
                    {compra.numeros.map(n => (
                        <div key={n} className="bg-purple-100 text-purple-800 font-bold text-2xl rounded-lg w-20 h-20 flex items-center justify-center shadow-md border-2 border-purple-200">
                            {n}
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-sm mb-8">
                <div>
                    <p className="font-bold text-gray-600">CLIENTE</p>
                    <p className="text-gray-800">{compra.clientes_rifa?.nome || 'Não identificado'}</p>
                </div>
                <div>
                    <p className="font-bold text-gray-600">VENDEDOR</p>
                    <p className="text-gray-800">{compra.vendedores_rifa.nome}</p>
                </div>
                <div>
                    <p className="font-bold text-gray-600">DATA DA COMPRA</p>
                    <p className="text-gray-800">{format(new Date(compra.created_at), "dd/MM/yyyy 'às' HH:mm")}</p>
                </div>
                <div>
                    <p className="font-bold text-gray-600">VALOR PAGO</p>
                    <p className="font-bold text-2xl text-green-600">R$ {compra.valor_total.toFixed(2)}</p>
                </div>
            </div>

            <div className="flex flex-col items-center justify-center bg-gray-50 p-6 rounded-lg">
                <p className="text-sm font-bold text-gray-600 mb-2">Aponte a câmera e acompanhe o sorteio!</p>
                <div className="p-2 bg-white rounded-lg shadow-md">
                    <QRCodeSVG value={rifaUrl} size={150} />
                </div>
            </div>

            <div className="text-center text-xs text-gray-500 mt-8">
                <p>Guarde este comprovante. Boa sorte!</p>
                <p>ID da Compra: {compra.id}</p>
            </div>
        </div>
    </div>
  );
}
