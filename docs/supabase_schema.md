# Infraestrutura de Dados - Supabase (Bingo Show)

Este documento detalha a arquitetura de backend, garantindo rastreabilidade para futuras manutenções e auditorias de segurança.

---

## 1. Tabelas e Relacionamentos (DDL)

### `perfis` (Tabela Central de Usuários)
Armazena dados de Jogadores, Vendedores e Administradores.
- **Relações:** PK `id` vinculada ao `auth.users`.
- **Colunas Críticas:**
  - `credits` (NUMERIC): Saldo real para apostas.
  - `fake_credits` (NUMERIC): Saldo para modo diversão.
  - `admins_id` (UUID): Identificador do Tenant (Dono do sistema).

### `partidas` (Motor do Jogo)
Instâncias de jogos de Bingo.
- **Relações:** FK `admin_id` vinculada a `admins.id`.
- **Colunas Críticas:**
  - `pot` (NUMERIC): Valor total arrecadado.
  - `called_numbers` (INT[]): Histórico de bolas sorteadas.
  - `is_festival` (BOOLEAN): Define se a partida possui múltiplas rodadas.

### `solicitacoes_resgate` (Financeiro - Saídas)
Pedidos de saque de créditos por parte dos jogadores.
- **Relações:** FK `player_id` (Jogador), FK `admin_id` (Tenant).
- **Status:** `pending`, `approved`, `rejected`.

### `pagbank_payments` (Logs de Gateway)
Registro de intenções de pagamento via PagBank.
- **Relações:** FK `user_id`, FK `admin_id`.
- **Uso:** Essencial para a idempotência do Webhook (evita duplicidade de saldo).

---

## 2. Segurança (Row Level Security - RLS)

O sistema utiliza o modelo **Multi-Tenant Isolation**.

| Tabela | Política de Segurança | Regra (USING) |
| :--- | :--- | :--- |
| `perfis` | Isolamento de Usuário | `auth.uid() = id` |
| `partidas` | Isolamento de Tenant | `is_admin() AND admin_id = auth.uid()` |
| `solicitacoes_resgate` | Visibilidade de Tenant | `admin_id = auth.uid()` (para admins) |
| `mensagens_resgate` | Proteção de Chat | `admin_id = auth.uid()` (Isolamento de conversa) |

---

## 3. Funções de Banco de Dados (RPC)

### `request_redeem`
**Objetivo:** Criar solicitação de saque com débito atômico.
- **Segurança:** `SECURITY DEFINER`.
- **Lógica:** Bloqueia a linha do perfil (`FOR UPDATE`), valida saldo, subtrai créditos e insere o registro de resgate e a mensagem inicial em uma única transação.

### `preparar_cartela_para_pagamento`
**Objetivo:** Realizar o "Split" de compras agrupadas.
- **Lógica:** Se um bilhete faz parte de um lote, ele é destacado para uma nova `compra_rifa` individual, garantindo que o cliente pague apenas o valor unitário (ex: R$ 15,00) ao escanear o QR Code.

### `increment_admin_profit`
**Objetivo:** Gestão de Caixa.
- **Lógica:** Adiciona ou subtrai valores do `admin_profit` na tabela de configurações.

---

## 4. Automação e Integridade (Triggers)

### `trg_mensagens_resgate_admin`
- **Função:** `set_admin_id_from_redeem_request()`.
- **Ação:** Antes de inserir uma mensagem, o banco consulta a solicitação pai e injeta o `admin_id` correto.
- **Motivo:** Previne erros de *Foreign Key* e garante que o jogador não precise conhecer o ID do administrador para enviar uma mensagem.

### `trg_pagbank_payments_admin`
- **Função:** `set_admin_id_from_auth_pagbank()`.
- **Ação:** Injeta o ID do administrador dono do sistema em cada log de pagamento gerado.

---

## 5. Edge Functions (Deno Runtime)

- **`create-pagbank-payment`**: Geração de PIX e Checkout de Cartão com validação de CPF e cálculo de taxas no servidor.
- **`pagbank-webhook`**: Recebimento de confirmação de pagamento e liberação automática de produtos.
- **`create-stripe-session`**: Gateway secundário para pagamentos internacionais via cartão.