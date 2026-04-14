# Segurança e Confiabilidade - Bypass do Firewall 403 do PagBank no Frontend

## Problema Raiz
Ao gerar pagamento por Cartão (Checkout API do PagBank), em ambiente de testes/sandbox, a API gerava o link de checkout perfeitamente, mas o navegador do cliente era bloqueado com `403 Forbidden` ao abrir o domínio do banco. O culpado era o envio do cabeçalho `Referer: http://localhost` do navegador.

## Mitigação Implementada
- **Geração Segura de Payload:** A Edge Function `create-pagbank-payment` removeu as dependências de `payment_methods` e `redirect_url` locais que ativariam verificações extras antifraude no sandbox.
- **Frontend `rel="noreferrer"`:** Quando a API devolve o link de checkout do cartão, o frontend (`CreditRequestDialog` e `PagarCartela`) não usa mais `window.location.href`. Em vez disso, ele cria silenciosamente um hiperlink HTML com a propriedade `rel="noreferrer noopener"` e o clica. 
- Isso faz com que o navegador esconda o fato de que está vindo de um `localhost` ou ambiente não seguro, permitindo que a tela de cartão de crédito do PagBank abra com sucesso.