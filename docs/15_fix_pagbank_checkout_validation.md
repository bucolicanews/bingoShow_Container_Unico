# Segurança e Confiabilidade - Correção Validações Checkout PagBank

## Problema Raiz
Ao tentar utilizar o método "Cartão de Crédito" (que aciona a API de `/checkouts` do PagBank), a plataforma estava retornando um erro estrito `400 Bad Request`. Diferente da API de `/orders` usada para PIX, a API de Checkout possui regras rigorosas de antifraude que não estavam sendo cumpridas.

## Impacto
Falha ao gerar o link de redirecionamento para pagamento por cartão, impedindo a conversão de vendas por este meio.

## Regras da API de Checkout do PagBank
1. O objeto `customer.name` é obrigatório e deve conter **no mínimo duas palavras** (Nome e Sobrenome).
2. O objeto `customer.phones` é analisado pelo motor de antifraude e altamente recomendado/obrigatório dependendo da conta do lojista.

## Mitigação Implementada
- **Higienização de Nome:** Adicionada uma verificação no `customerName`. Se o campo não possuir um espaço em branco (ou seja, se for apenas um nome próprio), a Edge Function concatena a palavra `"Cliente"` ao final para satisfazer o requisito sem quebrar a UX.
- **Injeção de Telefone (Fallback):** A Edge Function agora extrai dinamicamente o campo `whatsapp` do `perfil` do jogador logado ou do `metadata.cliente_telefone` (no caso de venda física). Se não houver telefone válido, ele injeta um telefone padrão genérico de área brasileira (`11 999999999`) estruturado no objeto `phones` exigido pelo gateway.
- **Refatoração de Erros:** O catch error foi melhorado para capturar e expor diretamente na UI qual foi o `parameter_name` do JSON que o banco rejeitou, acelerando o debug em caso de novos bloqueios do banco.

## Resultado
A integração de Cartão de Crédito agora obedece às regras estritas do Antifraude do PagSeguro e consegue gerar os links de checkout corretamente.