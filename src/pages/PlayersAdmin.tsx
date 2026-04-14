import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '@/contexts/GameContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Coins, Edit, Zap, ZapOff, Loader2, DollarSign, ShieldBan, ShieldCheck, Trash2 } from 'lucide-react';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Profile } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Prize } from '@/types/match';

const formatPrize = (prize: Prize) => {
  if (prize.type === 'product') return prize.productName || 'Produto';
  if (prize.type === 'fixed') return `${prize.value} créditos`;
  if (prize.type === 'percentage') return `${prize.value}% do pote`;
  return 'N/A';
};

const PlayersAdmin = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { players, allPlayerCards, updatePlayerCredits, allWins, matches, gameSettings, toggleBlockPlayer, deletePlayer } = useGame();
  const [selectedPlayer, setSelectedPlayer] = useState<Profile | null>(null);
  const [creditAmount, setCreditAmount] = useState<number>(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUpdatingCredits, setIsUpdatingCredits] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalCreditsInPlay = useMemo(() => {
    return (players || []).reduce((acc, player) => acc + Number(player.credits || 0), 0);
  }, [players]);

  const totalValueInReais = useMemo(() => {
    const valorPorCredito = gameSettings?.valor_por_credito || 1;
    return totalCreditsInPlay * valorPorCredito;
  }, [totalCreditsInPlay, gameSettings]);

  if (!profile || profile.role !== 'admin') {
    navigate('/');
    return null;
  }

  const handleOpenDialog = (player: Profile) => {
    setSelectedPlayer(player);
    setCreditAmount(0);
    setIsDialogOpen(true);
  };

  const handleUpdateCredits = async (amount: number) => {
    if (selectedPlayer && amount !== 0) {
      setIsUpdatingCredits(true);
      const success = await updatePlayerCredits(selectedPlayer.id, amount);
      setIsUpdatingCredits(false);
      if (success) setIsDialogOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    const success = await deletePlayer(deleteConfirmId);
    setIsDeleting(false);
    if (success) {
      setDeleteConfirmId(null);
      setIsDialogOpen(false);
    }
  };

  const selectedPlayerCards = selectedPlayer ? allPlayerCards.filter(c => c.player_id === selectedPlayer.id) : [];
  const selectedPlayerWins = selectedPlayer ? allWins.filter(w => w.player_id === selectedPlayer.id) : [];

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Gerenciar Jogadores</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card-container p-4">
          <div className="flex items-center text-muted-foreground mb-2">
            <Coins className="w-4 h-4 mr-2" />
            <h3 className="text-sm font-semibold">Total de Créditos em Jogo</h3>
          </div>
          <p className="text-2xl font-bold font-heading">{totalCreditsInPlay.toFixed(2)} cr.</p>
          <p className="text-xs text-muted-foreground">Soma dos saldos de todos os jogadores.</p>
        </div>
        <div className="card-container p-4">
          <div className="flex items-center text-muted-foreground mb-2">
            <DollarSign className="w-4 h-4 mr-2" />
            <h3 className="text-sm font-semibold">Valor Correspondente</h3>
          </div>
          <p className="text-2xl font-bold font-heading text-primary">
            R$ {totalValueInReais.toFixed(2).replace('.', ',')}
          </p>
          <p className="text-xs text-muted-foreground">
            Baseado em R$ {gameSettings?.valor_por_credito?.toFixed(2).replace('.', ',')} por crédito.
          </p>
        </div>
      </div>

      <div className="card-container overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jogador</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead className="text-center">Créditos</TableHead>
              <TableHead className="text-center">Cartelas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map(player => {
              const playerCardsCount = allPlayerCards.filter(c => c.player_id === player.id).length;
              return (
                <TableRow key={player.id} className={player.bloqueado ? 'bg-destructive/10 hover:bg-destructive/15' : ''}>
                  <TableCell className="min-w-[200px]">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar url={player.avatar_url} />
                      <div>
                        <span className={`font-medium ${player.bloqueado ? 'text-destructive' : ''}`}>{player.full_name || 'Não definido'}</span>
                        {player.bloqueado && <Badge variant="destructive" className="ml-2 text-[10px]">Bloqueado</Badge>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{player.cpf || '-'}</TableCell>
                  <TableCell>{player.whatsapp || '-'}</TableCell>
                  <TableCell className="text-center font-mono">{Number(player.credits || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-center font-mono">{playerCardsCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={player.bloqueado ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-destructive hover:text-destructive hover:bg-destructive/10'}
                        title={player.bloqueado ? 'Desbloquear' : 'Bloquear'}
                        onClick={() => toggleBlockPlayer(player.id, !player.bloqueado)}
                      >
                        {player.bloqueado ? <ShieldCheck className="w-4 h-4" /> : <ShieldBan className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Deletar jogador"
                        onClick={() => setDeleteConfirmId(player.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleOpenDialog(player)}>
                        <Edit className="w-3 h-3 mr-2" />
                        Gerenciar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Gerenciar: {selectedPlayer?.full_name}</DialogTitle>
            <DialogDescription>
              Visualize detalhes, gerencie créditos e veja as cartelas do jogador.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted-foreground border-t border-b py-4">
            <div><strong>CPF:</strong> {selectedPlayer?.cpf || 'Não informado'}</div>
            <div><strong>WhatsApp:</strong> {selectedPlayer?.whatsapp || 'Não informado'}</div>
            <div className="col-span-2"><strong>Endereço:</strong> {selectedPlayer?.address || 'Não informado'}</div>
          </div>

          <Tabs defaultValue="credits" className="w-full">
            <TabsList className="flex flex-wrap h-auto w-full bg-muted p-1 gap-1">
              <TabsTrigger value="credits" className="flex-1 py-2 text-[10px] sm:text-sm">
                <span className="hidden sm:inline">Gerenciar </span>Créditos
              </TabsTrigger>
              <TabsTrigger value="cards" className="flex-1 py-2 text-[10px] sm:text-sm">
                Cartelas ({selectedPlayerCards.length})
              </TabsTrigger>
              <TabsTrigger value="wins" className="flex-1 py-2 text-[10px] sm:text-sm">
                Vitórias ({selectedPlayerWins.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="credits">
              <div className="py-4 space-y-4">
                <p>Saldo atual: <strong className="font-mono">{Number(selectedPlayer?.credits || 0).toFixed(2)}</strong> créditos</p>
                <div>
                  <label htmlFor="creditAmount" className="text-sm font-medium">Valor a adicionar/remover</label>
                  <Input
                    id="creditAmount"
                    type="number"
                    step="0.01"
                    value={creditAmount === 0 ? '' : creditAmount}
                    onChange={(e) => setCreditAmount(Number(e.target.value) || 0)}
                    placeholder="Ex: 50.50 ou -20.00"
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Fechar</Button>
                </DialogClose>
                <Button onClick={() => handleUpdateCredits(creditAmount)} disabled={isUpdatingCredits}>
                  {isUpdatingCredits ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Coins className="w-4 h-4 mr-2" />}
                  {isUpdatingCredits ? 'Salvando...' : 'Confirmar'}
                </Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="cards">
              <div className="max-h-64 overflow-y-auto mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead className="text-center">Usos</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPlayerCards.map(card => (
                      <TableRow key={card.id}>
                        <TableCell className="font-medium">{card.name}</TableCell>
                        <TableCell className="font-mono text-xs">...{card.id.slice(-6)}</TableCell>
                        <TableCell className="text-center font-mono">{card.uses_left}</TableCell>
                        <TableCell className="text-center">
                          {card.uses_left > 0 ? (
                            <Badge className="bg-success/10 text-success hover:bg-success/20">
                              <Zap className="w-3 h-3 mr-1" /> Válida
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <ZapOff className="w-3 h-3 mr-1" /> Sem Usos
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {selectedPlayerCards.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">Este jogador não possui cartelas.</p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="wins">
              <div className="max-h-64 overflow-y-auto mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partida</TableHead>
                      <TableHead>Cartela</TableHead>
                      <TableHead>Prêmio</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPlayerWins.map(win => {
                      const match = matches.find(m => m.id === win.match_id);
                      const card = allPlayerCards.find(c => c.id === win.player_card_id);
                      return (
                        <TableRow key={win.id}>
                          <TableCell>{match?.name || 'Partida Excluída'}</TableCell>
                          <TableCell>{card?.name || 'Cartela Excluída'}</TableCell>
                          <TableCell>{formatPrize(win.prize_details)}</TableCell>
                          <TableCell>{format(new Date(win.won_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {selectedPlayerWins.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">Este jogador ainda não venceu.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteConfirmId} onOpenChange={open => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Confirmar Exclusão
            </DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. O jogador e todos os seus dados serão permanentemente removidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PlayersAdmin;