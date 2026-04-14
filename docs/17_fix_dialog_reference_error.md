# Correção - Uncaught ReferenceError no Modal de Créditos

## Problema Raiz
Ao tentar otimizar a exibição das taxas do PagBank e Stripe, a constante `cardFeeDetails` (que armazena a simulação do acréscimo de Cartão do PagBank) foi acidentalmente removida das variáveis calculadas no topo do arquivo `CreditRequestDialog.tsx`. No entanto, a UI ainda tentava ler essa variável para exibir a mensagem "Acréscimo de R$ X ref. a taxa", causando o erro fatal `ReferenceError` que quebrou a tela inteira com a página em branco (crash React).

## Mitigação Implementada
- **Restauração de Variável:** A função interna `calcPagbankFee` foi reestabelecida, inicializando corretamente as constantes `pixFeeDetails` e `cardFeeDetails` a partir das regras de negócio do painel Administrativo.
- **Fail Safe (UI):** O código agora garante que a UI suporte a ausência dos dados (usando validações ternárias limpas), prevenindo que a página inteira "caia" se as configurações do banco não tiverem retornado ainda.

## Resultado
A tela "Solicitar Créditos" carrega perfeitamente. O usuário pode alternar entre "PIX Automático", "Cartão PagBank" e "PIX Manual" e os cálculos das taxas são renderizados com segurança.