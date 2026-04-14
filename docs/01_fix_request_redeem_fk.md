# Correção de Constraint e Segurança na Função `request_redeem`

## Descrição
Correção de bug crítico (`409 Conflict`) ao solicitar resgate de créditos. O banco de dados recusava a transação por violação da Foreign Key `mensagens_resgate_admin_id_fkey` na tabela `mensagens_resgate`. A função RPC foi reescrita para garantir integridade multi-tenant e segurança avançada nos inputs.

## Entradas
- `p_credits` (NUMERIC): Quantidade de créditos a descontar.
- `p_amount` (NUMERIC): Valor em reais a receber.
- `p_message` (TEXT, Opcional): Chave PIX ou mensagem do jogador.

## Saídas
- `json`: Objeto contendo `{ "success": boolean, "error": string, "request_id": UUID }`

## Fluxo
1. **Validação de Entrada**: Verifica se `p_credits` e `p_amount` são maiores que 0.
2. **Autenticação**: Obtém o `auth.uid()`. Se nulo, aborta.
3. **Lock de Registro**: Bloqueia a linha do jogador na tabela `perfis` (`FOR UPDATE`) para evitar concorrência e extrai saldo (`credits`) e tenant (`admins_id`).
4. **Validação de Saldo**: Aborta se o saldo for menor que a quantia solicitada.
5. **Débito Atômico**: Subtrai os créditos da tabela `perfis`.
6. **Criação da Solicitação**: Insere em `solicitacoes_resgate` (injetando `admins_id`).
7. **Registro de Mensagem**: Insere em `mensagens_resgate` injetando obrigatoriamente a coluna `admin_id` para respeitar a chave estrangeira do tenant.

## Dependências
- Tabela `perfis`
- Tabela `solicitacoes_resgate`
- Tabela `mensagens_resgate`

## Chamado por
- Cliente React via `supabase.rpc('request_redeem')` no hook `useRedeemRequests.ts`.

## Segurança - Mitigation de Vulnerabilidades (sec01)

### Validações Aplicadas
- Verificação de saldo matemático (`p_credits > 0`).

### Sanitização
- `trim()` aplicado ao campo `p_message` para remoção de espaços em branco indevidos e prevenção de inputs fantasma.

### Riscos Identificados
- **Race Condition / Double Spending:** Múltiplas chamadas simultâneas poderiam ultrapassar o saldo.
- **Bypass de Tenant:** Usuário poderia injetar mensagens fora do seu ecossistema.
- **Input Negativo:** Input de resgate negativo poderia adicionar saldo à conta indevidamente.

### Mitigações Implementadas
- Uso de `FOR UPDATE` para lock da linha, evitando Double Spending.
- Remoção total da dependência de parâmetros externos para `admin_id`. O sistema confia apenas na chave associada ao perfil autenticado (Zero Trust).
- Condição inicial barrando `<= 0`.

## Histórico de Alterações
- **Data**: Atual
- **Alteração**: Refatoração da RPC `request_redeem`. Inclusão de `admin_id` no insert de `mensagens_resgate` e `solicitacoes_resgate`.
- **Motivo**: Correção de FK Constraint Error e implementação de Application Security na validação de inputs.