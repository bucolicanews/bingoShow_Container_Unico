# Segurança e Governança - Checkout PagBank (Redirect URL)

## Problema Raiz
Ao gerar pagamento por Cartão (Checkout API do PagBank), o servidor local (`localhost` ou `http://`) estava passando a URL de retorno (sucesso/cancelamento) para o parâmetro `redirect_url` do payload. A API antifraude do PagBank possui uma validação estrita que rejeita qualquer URL que não seja pública e protegida por HTTPS, gerando o erro `400 Bad Request - Field has an invalid value (redirect_url)`.

## Impacto
Desenvolvedores e instâncias locais eram impedidos de testar e gerar o link de pagamento do Cartão de Crédito, bloqueando os testes locais.

## Mitigação Implementada (Sanitização Condicional)
- **Validação de Ambiente:** A Edge Function `create-pagbank-payment` agora verifica a URL recebida do frontend no campo `metadata.origin`.
- **Fallback Seguro (Dummy URL):** Se a URL contiver `localhost`, `127.0.0.1` ou iniciar com `http://`, a função substitui temporariamente o `redirect_url` por um domínio HTTPS válido genérico (`https://bingoshow-app.vercel.app`).
- **Comportamento em Produção:** Quando o sistema for publicado no domínio final (ex: `https://meubingo.com`), a regra será ignorada, e o PagBank redirecionará os clientes perfeitamente de volta para o aplicativo.

## Resultado
A API do PagBank aceita o payload local e gera o Checkout sem erros de validação de URL, permitindo que o desenvolvimento e testes de pagamento via cartão fluam normalmente.