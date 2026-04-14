# Módulo: Integração PagBank (Database)

## Descrição
Estrutura de banco de dados criada para suportar a integração de pagamentos via PagBank (PIX), permitindo cobranças automatizadas e conciliação de pagamentos para Rifas, Bingos e Compra de Créditos.

## Entradas (Schema)
- Tabela `configuracoes`: Recebeu as colunas `pagbank_enabled`, `pagbank_env`, `pagbank_token_sandbox`, `pagbank_token_producao`.
- Tabela `pagbank_payments`: Nova tabela para registrar intenções de pagamento e webhooks (`reference_id`, `pagbank_order_id`, `amount`, `status`, `payment_type`).

## Saídas
- Estrutura pronta para ser consumida pelas Edge Functions (`create-pagbank-payment` e `pagbank-webhook`).

## Dependências
- `auth.users` (Foreign Key em `user_id`).
- RPC `is_admin()` (Usado nas políticas RLS).

## Chamado por
- Frontend (Painel Admin para salvar configurações).
- Edge Functions (Para gerar e atualizar status de pagamentos).

## Riscos / Observações
- **Risco Identificado:** Exposição de tokens de produção.
- **Mitigação:** Tokens salvos na tabela `configuracoes` que já possui RLS blindado contra usuários normais. Apenas `admin_id` e a `Service Role Key` (usada pelas Edge Functions) têm acesso a esses dados.
- O campo `pagbank_order_id` pode ser nulo inicialmente, sendo preenchido assim que a API do PagBank confirmar a criação da *Order*.

## Histórico de Alterações
- Data: Atual
- Alteração: Criação da tabela `pagbank_payments` e adição de colunas em `configuracoes`.
- Motivo: Fase 1 da substituição/adição do gateway de pagamento PagBank.