import { useMemo } from 'react';
import { useRifaAdmin } from '@/hooks/useRifaAdmin';
import { useGame } from '@/contexts/GameContext';
import { Match } from '@/types/match';
import { FolhaBingoFisico } from '@/types/match';
import { AcertoVendedor } from '@/types/rifa';
import { MatchCard } from '@/types/match';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, Landmark, Trophy, HandCoins, BadgeDollarSign, BarChart3, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const statusLabel: Record<string, string> = {
  waiting: 'Aguardando',
  open: 'Aberta',
  in_progress: 'Em andamento',
  finished: 'Encerrada',
};

const statusColor: Record<string, string> = {
  waiting: 'bg-muted text-muted-foreground',
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  finished: 'bg-emerald-100 text-emerald-700',
};

interface PartidaFinanceiro {
  partida: Match;
  arrecadacaoTotal: number;
  receitaOnline: number;
  receitaFisica: number;
  premioValor: number | null;
  premioLabel: string;
  comissaoFisica: number;
  ganhoAdminEstimado: number | null;
  totalCartelas: number;
}

const getPremioInfo = (partida: Match) => {
  const prizeType = partida.prize?.type;
  const prizeValue = Number(partida.prize?.value ?? 0);
  const pot = Number(partida.pot ?? 0);

  if (prizeType === 'fixed') {
    return {
      premioValor: prizeValue,
      premioLabel: fmt(prizeValue),
    };
  }

  if (prizeType === 'percentage') {
    const premioCalculado = (pot * prizeValue) / 100;
    return {
      premioValor: premioCalculado,
      premioLabel: `${prizeValue}% (${fmt(premioCalculado)})`,
    };
  }

  if (prizeType === 'product') {
    return {
      premioValor: null,
      premioLabel: partida.prize?.productName || 'Produto',
    };
  }

  return {
    premioValor: 0,
    premioLabel: fmt(0),
  };
};

const FinanceiroAdmin = () => {
  const { todasFolhasBingo, acertosPendentes } = useRifaAdmin() as {
    todasFolhasBingo: FolhaBingoFisico[];
    acertosPendentes: AcertoVendedor[];
  };
  const { gameSettings, matches = [], matchCards = [], isLoading: isLoadingMatches } = useGame() as {
    gameSettings: { admin_profit?: number } | null;
    matches: Match[];
    matchCards: MatchCard[];
    isLoading: boolean;
  };
  const partidas = matches;
  const isLoading = isLoadingMatches;

  const dados = useMemo<PartidaFinanceiro[]>(() => {
    // mapa venda -> partida para atribuição de comissão
    const vendaMap = new Map<string, FolhaBingoFisico>(todasFolhasBingo.map(v => [v.id, v]));
    const acertosAprovados = acertosPendentes.filter(a => a.status === 'aprovado');

    return partidas.map(partida => {
      // Receita física: vendas pagas para esta partida
      const vendasPago = todasFolhasBingo.filter(
        v => v.match_id === partida.id && v.status === 'pago',
      );
      const receitaFisica = vendasPago.reduce((s, v) => s + Number(v.valor_pago), 0);
      const totalCartelas = vendasPago.length;

      // Comissão física proporcional a partir dos acertos aprovados
      let comissaoFisica = 0;
      for (const acerto of acertosAprovados) {
        const bingoIds: string[] = acerto.bingo_ids ?? [];
        if (bingoIds.length === 0) continue;

        const idsNestaPartida = bingoIds.filter(id => vendaMap.get(id)?.match_id === partida.id);
        if (idsNestaPartida.length === 0) continue;

        const totalAcerto = bingoIds.reduce((s, id) => s + Number(vendaMap.get(id)?.valor_pago ?? 0), 0);
        const totalNaPartida = idsNestaPartida.reduce((s, id) => s + Number(vendaMap.get(id)?.valor_pago ?? 0), 0);

        if (totalAcerto > 0) {
          comissaoFisica += Number(acerto.comissao_paga ?? 0) * (totalNaPartida / totalAcerto);
        }
      }

      const cartelasReaisOnline = matchCards.filter(
        c => c.match_id === partida.id && c.credit_type === 'real',
      );
      const receitaOnline = cartelasReaisOnline.length * Number(partida.card_price ?? 0);
      const arrecadacaoTotal = Number(partida.pot ?? receitaOnline + receitaFisica);
      const { premioValor, premioLabel } = getPremioInfo(partida);
      const ganhoAdminEstimado = premioValor === null
        ? null
        : arrecadacaoTotal - premioValor - comissaoFisica;

      return {
        partida,
        arrecadacaoTotal,
        receitaOnline,
        receitaFisica,
        premioValor,
        premioLabel,
        comissaoFisica,
        ganhoAdminEstimado,
        totalCartelas,
      };
    });
  }, [partidas, todasFolhasBingo, acertosPendentes, matchCards]);

  const totais = useMemo(() => {
    const totalArrecadado = dados.reduce((s, d) => s + d.arrecadacaoTotal, 0);
    const totalOnline = dados.reduce((s, d) => s + d.receitaOnline, 0);
    const totalFisica = dados.reduce((s, d) => s + d.receitaFisica, 0);
    const totalPremios = dados.reduce((s, d) => s + Number(d.premioValor ?? 0), 0);
    const totalComissoes = acertosPendentes
      .filter(a => a.status === 'aprovado')
      .reduce((s, a) => s + Number(a.comissao_paga ?? 0), 0);
    const totalGanhoAdmin = dados.reduce((s, d) => s + Number(d.ganhoAdminEstimado ?? 0), 0);
    return { totalArrecadado, totalOnline, totalFisica, totalPremios, totalComissoes, totalGanhoAdmin };
  }, [dados, acertosPendentes]);

  const adminProfit = Number(gameSettings?.admin_profit ?? 0);

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-xl font-bold text-foreground flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        Financeiro por Partida
      </h2>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Landmark className="w-5 h-5 text-emerald-600" />}
          label="Caixa Admin"
          value={fmt(adminProfit)}
          sub="saldo atual acumulado"
          highlight
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
          label="Arrecadação Total"
          value={fmt(totais.totalArrecadado)}
          sub="pote somado das partidas"
        />
        <SummaryCard
          icon={<BadgeDollarSign className="w-5 h-5 text-violet-500" />}
          label="Prêmios"
          value={fmt(totais.totalPremios)}
          sub="valor pago aos vencedores"
        />
        <SummaryCard
          icon={<HandCoins className="w-5 h-5 text-amber-500" />}
          label="Comissões Pagas"
          value={fmt(totais.totalComissoes)}
          sub="acertos aprovados"
        />
      </div>

      {/* Resultado líquido físico */}
      <div className="card-container p-4 flex items-center justify-between bg-emerald-50 border border-emerald-200">
        <div className="flex items-center gap-2 text-emerald-700">
          <Trophy className="w-5 h-5" />
          <div>
            <p className="text-xs font-medium text-emerald-600">Ganho Estimado do Admin (arrecadação − prêmio − comissão)</p>
            <p className="text-2xl font-bold font-heading">{fmt(totais.totalGanhoAdmin)}</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-emerald-400" />
      </div>

      {/* Tabela por partida */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando partidas...</p>
      ) : dados.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma partida encontrada.</p>
      ) : (
        <div className="space-y-3">
          {dados.map(d => (
            <PartidaRow key={d.partida.id} d={d} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}

const SummaryCard = ({ icon, label, value, sub, highlight }: SummaryCardProps) => (
  <div className={cn('card-container p-4', highlight && 'border-2 border-emerald-300 bg-emerald-50')}>
    <div className="flex items-center gap-2 text-muted-foreground mb-1">
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </div>
    <p className={cn('text-lg font-bold font-heading', highlight && 'text-emerald-700')}>{value}</p>
    <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
  </div>
);

const PartidaRow = ({ d }: { d: PartidaFinanceiro }) => {
  const {
    partida,
    arrecadacaoTotal,
    receitaOnline,
    receitaFisica,
    premioValor,
    premioLabel,
    comissaoFisica,
    ganhoAdminEstimado,
    totalCartelas,
  } = d;

  return (
    <div className="card-container p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-sm">{partida.name}</p>
          <p className="text-xs text-muted-foreground">
            {partida.start_time
              ? format(new Date(partida.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
              : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={cn('text-[10px] px-2 py-0.5', statusColor[partida.status] ?? 'bg-muted text-muted-foreground')}
            variant="secondary"
          >
            {statusLabel[partida.status] ?? partida.status}
          </Badge>
          {totalCartelas > 0 && (
            <span className="text-[10px] text-muted-foreground">{totalCartelas} cartelas físicas</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <MetricBox label="Quanto foi a partida" value={fmt(arrecadacaoTotal)} color="text-blue-600" />
        <MetricBox label="Quanto o vencedor ganhou" value={premioLabel} color="text-violet-600" />
        <MetricBox label="Comissão de vendedor" value={fmt(comissaoFisica)} color="text-amber-600" />
        <MetricBox
          label="Quanto o admin ganhou"
          value={ganhoAdminEstimado === null ? 'Produto/indef.' : fmt(ganhoAdminEstimado)}
          color={ganhoAdminEstimado === null || ganhoAdminEstimado >= 0 ? 'text-emerald-600' : 'text-destructive'}
          bold
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <MetricBox label="Venda no app" value={fmt(receitaOnline)} color="text-sky-600" />
        <MetricBox label="Venda física" value={fmt(receitaFisica)} color="text-fuchsia-600" />
      </div>

      {premioValor === null && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nesta partida o prêmio é produto. O valor do prêmio ao vencedor não está em reais no sistema, então o ganho exato do admin depende do custo desse produto.
        </p>
      )}
    </div>
  );
};

interface MetricBoxProps {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}

const MetricBox = ({ label, value, color, bold }: MetricBoxProps) => (
  <div className="bg-muted/40 rounded-md p-2">
    <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
    <p className={cn('text-sm font-semibold', color, bold && 'text-base font-bold')}>{value}</p>
  </div>
);

export default FinanceiroAdmin;
