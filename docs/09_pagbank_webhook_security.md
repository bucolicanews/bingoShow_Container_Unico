# Segurança e Automação - Webhook PagBank

## Descrição
Implementação do Webhook para receber as confirmações de pagamento da API do PagBank de forma assíncrona, validando os dados e aplicando regras financeiras diretamente no banco de dados.

## Tipo de Entrada
- POST JSON proveniente da infraestrutura da API do PagBank. O payload contém o objeto `charge` com o `reference_id` (que garante a rastreabilidade interna) e o `status` (`PAID`, `WAITING`, etc.).

## Validações Aplicadas
- Verificação de existência do `reference_id` e checagem de duplo processamento (Idempotência). Se o pagamento já estiver como `PAID` em nossa tabela de log `pagbank_payments`, a função aborta para não duplicar saldo ou lucro.
- A função distingue automaticamente entre pagamentos de `credits` (adiciona saldo no perfis) e `venda_bingo / venda_rifa` (valida o bilhete).

## Lógica Financeira (Comissões)
O Webhook possui a responsabilidade de executar a matemática contábil:
1. Atribui a comissão ao vendedor de origem da cartela física/online.
2. Deposita o lucro líquido (`amountPaid - comissaoValor`) diretamente no `admin_profit` da tabela `configuracoes`.
3. Direciona o valor bruto arrecadado para o `pot` da respectiva partida de bingo.

## Riscos Identificados
- **Injeção Falsa via Webhook:** Um atacante pode descobrir a URL da Edge Function e enviar um payload forjado contendo o status "PAID" para roubar créditos.
- **Solução Implementada (No Frontend):** Como o banco de dados confia no Payload do Webhook, o código foi reescrito (na etapa 3) para ignorar envios estáticos de frontend. Toda atualização que afete saldos passa obrigatoriamente pelo gateway Backend-to-Backend. Se necessário na próxima etapa, validaremos assinatura de Payload (`x-authenticity-token`).

## Histórico de Alterações
- Data: Atual
- Arquivo: `supabase/functions/pagbank-webhook/index.ts`
- Motivo: Última etapa da implantação PagBank, permitindo a liberação totalmente automática de transações pagas.