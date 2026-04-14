export type RifaStatus = 'ativa' | 'finalizada' | 'cancelada';
export type NumeroStatus = 'disponivel' | 'reservado' | 'vendido';
export type TipoPagamento = 'creditos' | 'vendedor';
export type StatusSolicitacao = 'pendente' | 'aprovado' | 'rejeitado';

export interface Rifa {
  id: string;
  nome: string;
  descricao: string | null;
  regulamento: string | null;
  fotos: string[];
  foto_capa: string | null;
  premio_descricao: string | null;
  premio_fotos: string[];
  quantidade_numeros: number;
  numero_inicial: number;
  custo_por_numero: number;
  custo_premio: number;
  preco_vendedor: number | null;
  data_inicio: string | null;
  data_encerramento: string | null;
  status: RifaStatus;
  numero_ganhador: number | null;
  ganhador_id: string | null;
  ganhador_confirmou: boolean | null;
  created_at: string;
  created_by: string | null;
}

export interface NumeroRifa {
  id: string;
  rifa_id: string;
  numero: number;
  status: NumeroStatus;
  comprador_id: string | null;
  vendedor_id: string | null;
  cliente_rifa_id: string | null;
  reservado_ate: string | null;
  nome_comprador: string | null;
  telefone_comprador: string | null;
  endereco_comprador: string | null;
}

export interface CompraRifa {
  id: string;
  rifa_id: string;
  comprador_id: string | null;
  vendedor_id: string | null;
  cliente_rifa_id: string | null;
  ref_vendedor_id: string | null;
  numeros: number[];
  valor_total: number;
  desconto_aplicado: number;
  tipo_pagamento: TipoPagamento;
  status: 'pago' | 'pendente' | 'em_analise';
  created_at: string;
}

export interface VendedorRifa {
  id: string;
  user_id: string | null;
  nome: string;
  documento: string | null;
  telefone: string | null;
  percentual_desconto: number;
  comissao_percentual: number;
  codigo_ref: string;
  ativo: boolean;
  created_at: string;
}

export interface ClienteRifa {
  id: string;
  nome: string;
  telefone: string | null;
  endereco: string | null;
  vendedor_id: string | null;
  created_at: string;
}

export interface CartelaRifa {
  id: string;
  numero_rifa_id: string;
  compra_id: string;
  codigo_validacao: string;
  qr_code_data: string | null;
  impresso: boolean;
  created_at: string;
}

export interface SolicitacaoVendedor {
  id: string;
  user_id: string;
  status: StatusSolicitacao;
  nome: string;
  documento: string | null;
  telefone: string | null;
  endereco: string | null;
  mensagem: string | null;
  mensagem_admin: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  perfis?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  cadastro?: CadastroVendedor | null;
}

export interface CadastroVendedor {
  id: string;
  user_id: string;
  nome_completo: string;
  telefone: string | null;
  endereco: string | null;
  cpf: string | null;
  rg: string | null;
  foto_url: string | null;
  documento_url: string | null;
  comprovante_endereco_url: string | null;
  created_at: string;
}

export interface AcertoVendedor {
  id: string;
  vendedor_id: string;
  valor: number;
  comissao_paga?: number;
  comprovante_url: string;
  status: 'pendente' | 'aprovado' | 'rejeitado' | 'aprovar' | 'rejeitar' | 'em_analise';
  bingo_ids: string[];
  rifa_ids: string[];
  created_at: string;
  repasse_concluido?: boolean;
  vendedores_rifa?: { nome: string };
}