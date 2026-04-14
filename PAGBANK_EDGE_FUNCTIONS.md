# PagBank - Funções de Borda (Edge Functions)

Este documento detalha a lógica de backend implementada nas Edge Functions do Supabase para a integração com o PagBank.

## 1. `create-pagbank-payment`

Esta é a função principal da integração, responsável por se comunicar com a API do PagBank para criar cobranças (PIX ou Cartão) e registrar a transação no banco de dados.

### Fluxo de Execução

1.  **Recebimento da Requisição:** A função é acionada por uma chamada `POST` do frontend, contendo os detalhes da compra.
2.  **Extração de Dados:** Obtém `amount`, `type`, `metadata`, `admin_id` e `payment_method` do corpo da requisição.
3.  **Consulta de Configurações:** Busca as credenciais e configurações do PagBank (ambiente, tokens, taxas) na tabela `configuracoes` com base no `admin_id`.
4.  **Identificação do Ambiente:** Define a URL da API do PagBank (`api.pagseguro.com` para produção, `sandbox.api.pagseguro.com` para teste) e o token de autorização correspondente.
5.  **Obtenção de Dados do Cliente:**
    - Recupera o `user_id` e `email` a partir do token de autorização (`Authorization` header).
    - Busca o nome completo (`full_name`), CPF (`cpf`) e telefone (`whatsapp`) do cliente na tabela `perfis`.
    - Atualiza os dados do cliente com informações enviadas no objeto `metadata`, se presentes. O CPF do perfil do usuário é atualizado se um novo CPF válido for enviado.
6.  **Validação de CPF/CNPJ:** Verifica se o `tax_id` (CPF/CNPJ) do cliente é matematicamente válido antes de prosseguir.
7.  **Cálculo de Taxas:** Se a configuração `pagbank_pass_fees_to_customer` estiver ativa, recalcula o `finalAmount` adicionando as taxas do PagBank.
8.  **Geração do Payload:** Monta o corpo da requisição para a API do PagBank com base no método de pagamento:
    - **`payment_method: 'CREDIT_CARD'` (API de Checkouts):**
        - **Endpoint:** `POST /checkouts`
        - **Payload:** Inclui `reference_id`, `customer` (com nome, email, CPF e telefone), `items`, e `notification_urls`.
    - **`payment_method: 'pix'` (API de Pedidos):**
        - **Endpoint:** `POST /orders`
        - **Payload:** Inclui `reference_id`, `customer`, `items`, `qr_codes` (com valor e data de expiração), e `notification_urls`.
9.  **Comunicação com o PagBank:** Envia a requisição para a API do PagBank com os cabeçalhos `Authorization` (Bearer Token) e `x-api-version: 4.0`.
10. **Tratamento de Erro da API:** Em caso de falha, a função captura o erro retornado pelo PagBank, formata uma mensagem clara e a retorna ao frontend. Erros de CPF inválido são tratados especificamente (`CPF_REQUIRED`).
11. **Registro no Banco de Dados:** Se a chamada à API for bem-sucedida, insere um novo registro na tabela `pagbank_payments` com o status `PENDING` e todos os detalhes da transação.
12. **Retorno ao Frontend:**
    - **PIX:** Retorna `{ success: true, qr_code, qr_code_text }`.
    - **Cartão:** Retorna `{ success: true, checkout_link }`.

### Variáveis de Ambiente

- **`SUPABASE_URL`**: URL do projeto Supabase.
- **`SUPABASE_SERVICE_ROLE_KEY`**: Chave de serviço do Supabase para acesso administrativo.

### Cabeçalhos da Requisição (para a API PagBank)

- **`Authorization`**: `Bearer {token}`
- **`Content-Type`**: `application/json`
- **`x-api-version`**: `4.0`

---

## 2. `pagbank-webhook`

Este endpoint é responsável por receber, validar e processar as notificações de pagamento enviadas pelo PagBank.

### Fluxo de Execução

1.  **Recebimento do Webhook:** A função é acionada quando o PagBank envia uma notificação `POST` para a URL configurada (`.../functions/v1/pagbank-webhook`).
2.  **Validação da Requisição:**
    - Extrai o corpo da requisição (`payload`).
    - Obtém o `reference_id` do objeto `charges` (ou da raiz do payload).
3.  **Consulta da Transação:** Busca na tabela `pagbank_payments` um registro com o `reference_id` correspondente.
4.  **Garantia de Idempotência:**
    - Se a transação não é encontrada ou se o seu status já é `PAID`, a função encerra a execução com sucesso (status 200). Isso previne o processamento duplicado de uma mesma notificação.
5.  **Processamento do Status:**
    - **Pagamento Confirmado (`PAID`, `COMPLETED`, `AUTHORIZED`):**
        - Atualiza o status na tabela `pagbank_payments` para `PAID`.
        - **Se `payment_type` for `'credits'`:**
            - Concede os créditos ao usuário, atualizando a coluna `credits` na tabela `perfis`.
            - Incrementa o lucro do administrador (`admin_profit`) na tabela `configuracoes`.
            - Cria um registro histórico na tabela `solicitacoes_credito` e uma mensagem de confirmação para o usuário.
        - **Se `payment_type` for `'venda_bingo'` ou `'venda_rifa'`:**
            - Atualiza o status da venda para `'pago'`.
            - Adiciona o valor ao pote (`pot`) da partida (para bingo).
            - Calcula e paga a comissão do vendedor (se houver), creditando o valor na sua conta de `credits`.
            - Incrementa o lucro do administrador, já deduzindo a comissão do vendedor.
    - **Outros Status:** Se o status for diferente de pago (ex: `WAITING`, `CANCELED`), a função apenas atualiza o campo `status` na tabela `pagbank_payments`.
6.  **Retorno ao PagBank:** Envia uma resposta com `status 200` e `{"success": true}` para confirmar ao PagBank que a notificação foi recebida e processada com sucesso.

### Tratamento de Erros

- Qualquer erro durante o processamento é capturado, logado no console do Supabase e a função retorna um `status 500` para indicar a falha ao PagBank, que tentará reenviar a notificação posteriormente.
