# PagBank - Estrutura do Banco de Dados

Este documento detalha as tabelas, gatilhos e funções de banco de dados relacionadas à integração com o PagBank.

## Tabelas

### `pagbank_payments`

Esta tabela armazena os logs de todas as transações geradas via PagBank, servindo como uma camada de segurança para garantir a idempotência dos webhooks.

- **Relações:**
    - Chave estrangeira para `user_id`, vinculando o pagamento a um usuário do sistema.
    - Chave estrangeira para `admin_id`, identificando o administrador da plataforma.

- **Propósito Principal:**
    - **Prevenção de Duplicidade:** O webhook do PagBank consulta esta tabela para verificar se um pagamento já foi processado, evitando que o mesmo saldo seja creditado duas vezes.
    - **Rastreabilidade:** Mantém um histórico completo de todas as intenções de pagamento.

## Gatilhos (Triggers)

### `trg_pagbank_payments_admin`

- **Função Associada:** `set_admin_id_from_auth_pagbank()`
- **Ação:** Antes de inserir um novo registro na tabela `pagbank_payments`, este gatilho é acionado para injetar automaticamente o `admin_id` do administrador do sistema.
- **Justificativa:** Garante que cada log de pagamento esteja corretamente associado ao tenant (administrador da plataforma), mantendo a consistência dos dados em um ambiente multi-tenant.

## Funções de Borda (Edge Functions)

### `create-pagbank-payment`

- **Descrição:** Responsável por gerar cobranças no PagBank, seja via PIX (QR Code) ou checkout de cartão de crédito.
- **Funcionalidades:**
    - **Validação de CPF:** Executa a validação do CPF do comprador no lado do servidor antes de enviar a requisição ao PagBank.
    - **Cálculo de Taxas:** Calcula as taxas de transação (se aplicável) no backend para garantir que o valor final esteja correto.

### `pagbank-webhook`

- **Descrição:** Endpoint que recebe as notificações de status de pagamento enviadas pelo PagBank.
- **Funcionalidades:**
    - **Confirmação de Pagamento:** Recebe a confirmação de que um pagamento foi efetuado com sucesso.
    - **Liberação de Produto:** Após confirmar o pagamento, aciona a lógica para liberar o produto ou crédito correspondente ao usuário no sistema.
    - **Segurança:** Garante que a requisição é genuína e processa o pagamento de forma segura e idempotente.
