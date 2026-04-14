# Flexibilidade de Gateways - Stripe e PagBank Simultâneos

## Descrição
Até a versão anterior, a ativação do PagBank desativava compulsoriamente a exibição do botão do Stripe. A pedido do administrador, a lógica foi alterada para permitir que ambos os gateways coexistam e sejam oferecidos simultaneamente aos clientes na tela de pagamento.

## Mitigação e Organização (UX)
Para evitar que o cliente se confunda com "dois botões de cartão de crédito" que cobram taxas diferentes:
1. O Cartão de Crédito do PagBank manteve a cor original azul (padrão nacional).
2. O Cartão de Crédito do Stripe foi movido para um "bloco de pagamento" à parte e pintado com a cor Índigo/Roxa, recebendo o rótulo "Cartão (Stripe)", deixando claro tratar-se de um processador internacional/alternativo.

## Histórico de Alterações
- Data: Atual
- Arquivos: `CreditRequestDialog.tsx` e `PagarCartela.tsx`.
- Motivo: Prover contingência de pagamentos aos clientes.