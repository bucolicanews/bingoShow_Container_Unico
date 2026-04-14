# Correção - Uncaught ReferenceError (QRCode is not defined)

## Descrição do Problema
O componente `PagarCartela.tsx` falhava e causava um travamento de tela branca (crash do React) devido a um `ReferenceError`. 
A tela exibia a opção de fallback "PIX Manual" utilizando a tag JSX `<QRCode />`, contudo o componente importado da biblioteca `qrcode.react` estava nomeado como `QRCodeSVG`.

## Impacto
Impossibilidade total de carregar a página de pagamentos avulsos de rifa ou bingo caso a configuração "PIX Manual" estivesse ativa no sistema, impedindo vendas.

## Mitigação Implementada
- A tag `<QRCode value={pixPayload} />` foi corrigida para `<QRCodeSVG value={pixPayload} />`, alinhando perfeitamente a renderização do DOM com o módulo importado no topo do arquivo.

## Histórico de Alterações
- Data: Atual
- Arquivos afetados: `src/pages/PagarCartela.tsx`.
- Motivo: Correção sintática para restabelecimento da interface.