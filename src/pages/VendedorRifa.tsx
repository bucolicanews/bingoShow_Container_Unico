import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRifaAdmin } from '@/hooks/useRifaAdmin';
import { useRifas } from '@/hooks/useRifas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Ticket,
  ShoppingCart,
  Users,
  Plus,
  Loader2,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { VendedorRifa, ClienteRifa, NumeroRifa } from '@/types/rifa';

export default function VendedorRifaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { vendedores, clientes, todasRifas, todasCompras, registrarVendaVendedor } = useRifaAdmin();
  const { getNumerosRifa } = useRifas();

  const meuVendedor = vendedores.find((v) => v.user_id === user?.id);

  const [selectedRifaId, setSelectedRifaId] = useState<string>('');
  const [selectedNumeros, setSelectedNumeros] = useState<number[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [numerosRifa, setNumerosRifa] = useState<NumeroRifa[]>([]);
  const [loadingNumeros, setLoadingNumeros] = useState(false);
  const [vendaDialogOpen, setVendaDialogOpen] = useState(false);

  const [novoClienteDialogOpen, setNovoClienteDialogOpen] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState('');
  const [novoClienteTelefone, setNovoClienteTelefone] = useState('');
  const [novoClienteEndereco, setNovoClienteEndereco] = useState('');
  const [savingCliente, setSavingCliente] = useState(false);

  const rifasAtivas = useMemo(() => todasRifas.filter((r) => r.status === 'ativa'), [todasRifas]);

  const meusClientes = useMemo(
    () => clientes.filter((c) => c.vendedor_id === meuVendedor?.id),
    [clientes, meuVendedor],
  );

  const minhasCompras = useMemo(
    () => todasCompras.filter((c) => c.vendedor_id === meuVendedor?.id),
    [todasCompras, meuVendedor],
  );

  const selectedRifa = useMemo(
    () => todasRifas.find((r) => r.id === selectedRifaId),
    [todasRifas, selectedRifaId],
  );

  useEffect(() => {
    if (!selectedRifaId) {
      setNumerosRifa([]);
      setSelectedNumeros([]);
      return;
    }
    setLoadingNumeros(true);
    const numeros = getNumerosRifa(selectedRifaId);
    setNumerosRifa(numeros);
    setSelectedNumeros([]);
    setLoadingNumeros(false);
  }, [selectedRifaId, getNumerosRifa]);

  const subtotal = useMemo(() => {
    if (!selectedRifa || selectedNumeros.length === 0) return 0;
    const desconto = meuVendedor?.percentual_desconto ?? 0;
    return selectedNumeros.length * selectedRifa.custo_por_numero * (1 - desconto / 100);
  }, [selectedRifa, selectedNumeros, meuVendedor]);

  const toggleNumero = (numero: number) => {
    setSelectedNumeros((prev) =>
      prev.includes(numero) ? prev.filter((n) => n !== numero) : [...prev, numero],
    );
  };

  const handleConfirmarVenda = async () => {
    if (!meuVendedor || !selectedRifaId || selectedNumeros.length === 0) {
      toast.error('Selecione uma rifa e pelo menos um número.');
      return;
    }
    const ok = await registrarVendaVendedor(
      selectedRifaId,
      meuVendedor.id,
      selectedNumeros,
      selectedClienteId || undefined,
    );
    if (ok) {
      setVendaDialogOpen(false);
      setSelectedRifaId('');
      setSelectedNumeros([]);
      setSelectedClienteId('');
    }
  };

  const handleAdicionarCliente = async () => {
    if (!novoClienteNome.trim() || !meuVendedor) return;
    setSavingCliente(true);
    const { error } = await supabase.from('clientes_rifa').insert([
      {
        nome: novoClienteNome.trim(),
        telefone: novoClienteTelefone.trim() || null,
        endereco: novoClienteEndereco.trim() || null,
        vendedor_id: meuVendedor.id,
      },
    ]);
    setSavingCliente(false);
    if (error) {
      toast.error('Erro ao adicionar cliente.');
    } else {
      toast.success('Cliente adicionado!');
      setNovoClienteNome('');
      setNovoClienteTelefone('');
      setNovoClienteEndereco('');
      setNovoClienteDialogOpen(false);
    }
  };

  const getNumeroColor = (status: string) => {
    if (status === 'vendido') return 'bg-red-200 text-red-800 cursor-not-allowed';
    if (status === 'reservado') return 'bg-yellow-200 text-yellow-800 cursor-not-allowed';
    return 'bg-green-100 text-green-800 hover:bg-green-300 cursor-pointer';
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Painel do Vendedor</h1>
        </div>

        {!meuVendedor ? (
          <div className="card-container p-8 text-center space-y-4">
            <Ticket className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">
              Você não está cadastrado como vendedor. Solicite ao administrador.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="card-container p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{meuVendedor.nome}</h2>
                  <p className="text-muted-foreground text-sm">
                    {meuVendedor.percentual_desconto}% de desconto
                  </p>
                </div>
                <Badge variant={meuVendedor.ativo ? 'default' : 'secondary'}>
                  {meuVendedor.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <Button
                onClick={() => setVendaDialogOpen(true)}
                disabled={!meuVendedor.ativo}
                className="w-full"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Registrar Venda
              </Button>
            </div>

            <div className="card-container p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5" /> Meus Clientes
                </h3>
                <Button size="sm" variant="outline" onClick={() => setNovoClienteDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Novo Cliente
                </Button>
              </div>
              {meusClientes.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhum cliente cadastrado.</p>
              ) : (
                <ul className="divide-y">
                  {meusClientes.map((c) => (
                    <li key={c.id} className="py-2 flex items-center justify-between">
                      <span className="font-medium">{c.nome}</span>
                      {c.telefone && (
                        <span className="text-sm text-muted-foreground">{c.telefone}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card-container p-6 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <DollarSign className="h-5 w-5" /> Vendas Recentes
              </h3>
              {minhasCompras.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma venda registrada.</p>
              ) : (
                <ul className="divide-y">
                  {minhasCompras.map((c) => (
                    <li key={c.id} className="py-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Números: {c.numeros.join(', ')}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-green-600">
                            R$ {c.valor_total.toFixed(2)}
                          </span>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={() => navigate(`/vendedor/imprimir-rifa/${c.id}`)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString('pt-BR')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={vendaDialogOpen} onOpenChange={setVendaDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Venda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rifa</Label>
              <Select
                value={selectedRifaId}
                onValueChange={(val) => setSelectedRifaId(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma rifa" />
                </SelectTrigger>
                <SelectContent>
                  {rifasAtivas.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRifaId && (
              <div className="space-y-2">
                <Label>Números</Label>
                {loadingNumeros ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto p-2 border rounded-md">
                    {numerosRifa.map((n) => (
                      <button
                        key={n.id}
                        disabled={n.status !== 'disponivel'}
                        onClick={() => n.status === 'disponivel' && toggleNumero(n.numero)}
                        className={`rounded p-1 text-xs font-semibold transition-colors ${
                          selectedNumeros.includes(n.numero)
                            ? 'bg-primary text-primary-foreground'
                            : getNumeroColor(n.status)
                        }`}
                      >
                        {n.numero}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {selectedNumeros.length} número(s) selecionado(s)
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Cliente (opcional)</Label>
              <Select
                value={selectedClienteId}
                onValueChange={setSelectedClienteId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {meusClientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedNumeros.length > 0 && selectedRifa && (
              <div className="card-container p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="font-bold text-lg">R$ {subtotal.toFixed(2)}</span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleConfirmarVenda}
              disabled={selectedNumeros.length === 0 || !selectedRifaId}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Confirmar Venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={novoClienteDialogOpen} onOpenChange={setNovoClienteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={novoClienteNome}
                onChange={(e) => setNovoClienteNome(e.target.value)}
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={novoClienteTelefone}
                onChange={(e) => setNovoClienteTelefone(e.target.value)}
                placeholder="Telefone"
              />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input
                value={novoClienteEndereco}
                onChange={(e) => setNovoClienteEndereco(e.target.value)}
                placeholder="Endereço"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleAdicionarCliente}
              disabled={savingCliente || !novoClienteNome.trim()}
            >
              {savingCliente ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
