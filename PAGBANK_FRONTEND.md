# PagBank - Integração Frontend

Este documento descreve como o frontend interage com a API do PagBank através das Supabase Edge Functions. A principal interação ocorre no componente `CreditRequestDialog.tsx`.

## Fluxo de Pagamento

O fluxo de pagamento é iniciado no componente `CreditRequestDialog`, que permite ao usuário comprar créditos usando diferentes métodos, incluindo o PagBank.

### 1. Chamada da Função `create-pagbank-payment`

Quando o usuário decide pagar com PagBank (seja PIX ou Cartão de Crédito), o frontend invoca a Supabase Edge Function `create-pagbank-payment`.

- **Gatilho:** Clique no botão "Pagar Agora" para cartão ou "Gerar QR Code PIX" para PIX.
- **Função Invocada:** `supabase.functions.invoke('create-pagbank-payment', { ... })`

### 2. Parâmetros Enviados

A função é chamada com um objeto `body` que contém os seguintes campos:

| Parâmetro | Tipo | Obrigatório | Descrição | Exemplo |
| :--- | :--- | :--- | :--- | :--- |
| `amount` | `Number` | Sim | O valor total da transação em reais. | `50.00` |
| `type` | `String` | Sim | O tipo de produto ou serviço sendo adquirido. No fluxo atual, é sempre `'credits'`. | `'credits'` |
| `admin_id` | `String` | Sim | O UUID do administrador da plataforma (tenant). | `'a1b2c3d4-...'` |
| `payment_method` | `String` | Sim | O método de pagamento escolhido. Pode ser `'pix'` ou `'CREDIT_CARD'`. | `'pix'` |
| `metadata` | `Object` | Sim | Um objeto contendo informações adicionais sobre a transação. | |
| `metadata.credits_requested` | `Number` | Sim | A quantidade de créditos que o usuário está comprando. | `100` |
| `metadata.customer_cpf` | `String` | Sim | O CPF do pagador, essencial para a validação no PagBank. | `'123.456.789-00'` |
| `metadata.origin` | `String` | Sim | A URL de origem da requisição, usada para construir URLs de redirecionamento e webhooks. | `'https://meu-site.com'` |

### Exemplo de Corpo da Requisição (Payload)

```json
{
  "body": {
    "amount": 50.00,
    "type": "credits",
    "admin_id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    "payment_method": "pix",
    "metadata": {
      "credits_requested": 100,
      "customer_cpf": "12345678900",
      "origin": "https://bingo.show"
    }
  }
}
```

### 3. Cabeçalhos (Headers)

- **Authorization:** O SDK do Supabase (`supabase-js`) gerencia automaticamente o cabeçalho `Authorization` com o token JWT do usuário autenticado.
- **Content-Type:** É automaticamente definido como `application/json`.

Não é necessário configurar manualmente nenhum cabeçalho para esta chamada.

## Resposta da Função

- **Sucesso (PIX):** A função retorna um objeto com `success: true`, `qr_code` (URL da imagem do QR Code) e `qr_code_text` (código "copia e cola").
- **Sucesso (Cartão):** A função retorna um objeto com `success: true` e `checkout_link` (URL para a página de pagamento do PagBank).
- **Erro:** A função retorna um objeto com `success: false` e uma mensagem de erro no campo `error`.
