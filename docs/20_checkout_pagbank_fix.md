# Segurança e Confiabilidade - Correção de Acesso Negado (403) no Checkout PagBank

## Problema Raiz
Ao tentar processar pagamentos de Cartão de Crédito via PagBank em ambiente de testes/sandbox, a API gerava o link de checkout com sucesso, mas o cliente recebia o erro `403 Forbidden` ao acessar a página.
Isso ocorre devido a uma restrição rigorosa do antifraude do PagBank, que bloqueia o link quando o parâmetro estrito `payment_methods: [{"type": "CREDIT_CARD"}]` é injetado no payload, ou quando a `redirect_url` enviada for local (`http://localhost`).

## Mitigação Implementada
- **Refatoração do Payload:** A Edge Function foi reescrita seguindo o padrão de integração livre. Omitimos a restrição forçada de método de pagamento no payload de `/checkouts`. Dessa forma, o link gerado pelo PagBank não "assusta" o validador antifraude, e a tela do banco é aberta com sucesso.
- **Sanitização de Redirect URL (Fail Safe):** A Edge Function agora inspeciona ativamente o `redirectUrl` recebido do frontend. Se ele contiver origens de desenvolvimento (`localhost`, `127.0.0.1`), a Edge Function **remove** ou **substitui** essa variável antes de enviar ao banco, permitindo que os testes ocorram perfeitamente sem o banco derrubar a requisição.
- **Frontend Mapping:** Os botões do frontend (`CreditRequestDialog` e `PagarCartela`) foram unificados. O botão "Cartão de Crédito" agora envia `CREDIT_CARD` como argumento de negócio para a Edge Function acionar o fluxo do `/checkouts`, sem expor as chaves secretas do PagBank na camada cliente.

## Resultado
A página de Checkout do PagBank abre perfeitamente para clientes pagarem via Cartão. O Stripe permanece no código como uma segunda opção de stand-by (reserva) ativável pelo painel do Admin, caso a plataforma deseje.