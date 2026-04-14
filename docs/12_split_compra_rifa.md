# Segurança Financeira - Desmembramento de "Carrinhos" (Split Compra Rifa)

## Descrição do Problema
O sistema permitia que vendedores reservassem múltiplos números em uma única operação. O banco de dados salvava isso como 1 registro na tabela `compras_rifa` (ex: 11 números, valor total = R$ 165,00).
Quando o cliente escaneava o QR Code de APENAS 1 bilhete físico que fazia parte desse pacote, a tela de pagamento tentava cobrar os R$ 165,00. Se o cliente pagasse, o webhook ativaria indevidamente os 11 bilhetes.

## Solução Implementada (RPC)
Criada a função PostgreSQL `preparar_cartela_para_pagamento`.
Essa função atua como um interceptador de pagamentos no frontend. Antes da página exibir o QR Code, ela é invocada:

## Fluxo (Como funciona)
1. O Frontend chama a RPC enviando o código do bilhete lido (`codigo_validacao`).
2. O Backend encontra a qual `compras_rifa` ele pertence.
3. Se essa compra contiver **mais de 1 número**, o backend executa um **split**:
   - Subtrai o valor unitário da compra original.
   - Remove o número atual do array da compra original.
   - Cria uma **NOVA compra** contendo exclusivamente esse número e seu valor exato (R$ 15).
   - Atualiza a cartela física para apontar para essa nova compra.
4. O frontend carrega a nova compra (que agora vale R$ 15,00) e o PagBank/Stripe geram a cobrança perfeita, garantindo que o webhook ativará SOMENTE esse bilhete quando o dinheiro cair.

## Riscos Mitigados
- **Fraude/Inconsistência Financeira:** Impede a validação de bilhetes que não foram pagos.
- **Cobrança Indevida:** O cliente não será assustado com uma cobrança maior do que a exibida no pedaço de papel que ele tem em mãos.