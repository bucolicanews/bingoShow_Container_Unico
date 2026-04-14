# Segurança e UX - Exibição Dinâmica de Comissão e Desconto (Painel Vendedor)

## Tipo de Entrada
- Configurações Globais (`gameSettings.comissao_vendedor_global` e `desconto_vendedor_global`).
- Configurações Individuais do Perfil do Vendedor (`vendedor.comissao_percentual` e `percentual_desconto`).
- Switches UI: `reservarFiado` e `bingoFiado`.

## Validações Aplicadas
- A interface agora calcula e explica explicitamente a prioridade do Banco de Dados: A Configuração Individual tem preferência absoluta sobre a Configuração Global. Se o valor individual for `0` ou nulo, o Global assume.
- Se a compra for `Fiado` (A Pagar Depois), a interface exibe o valor bruto e a promessa de **Comissão** futura a ser devolvida no saldo.
- Se a compra for `À Vista com Saldo`, a interface exibe o valor cortado original, o valor final e a porcentagem de **Desconto** imediata, sincronizando perfeitamente com a lógica de negócio das RPCs `reservar_numeros_vendedor` e `comprar_folhas_bingo_vendedor`.

## Sanitização
- Valores forçados com `Number()` para garantir precisão matemática e ausência de falsos positivos com strings do banco de dados.

## Riscos Identificados
- **Fricção de Negócio (Desconfiança):** O vendedor poderia achar que o sistema estava subtraindo seus lucros caso a tela mostrasse o texto sobre "comissão" ao invés da regra de "desconto" durante uma transação à vista, que não gera comissão posterior.

## Mitigações Implementadas
- O Hook `useMemo` garante que o valor refletido na tela seja sempre idêntico ao que o servidor (Edge/RPC) executará, não deixando o texto de vendas descolado da ação financeira real.

## Testes Realizados
- A alternância do switch "Fiado" muda instantaneamente o texto de instrução e a formatação do subtotal da compra, reforçando a governança de dados.

## Chamado por
- Componente `VendedorPainel.tsx` (Aba de Rifas e Aba de Bingos).

## Histórico de Alterações
- Data: Atual
- Alteração: Introdução da variável `descontoAtivo` e renderização condicional baseada na modalidade da transação.