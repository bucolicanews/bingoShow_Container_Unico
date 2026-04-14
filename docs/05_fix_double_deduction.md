# Segurança e Integridade - Prevenção de Duplo Débito (Double Deduction)

## Descrição
Correção do fluxo de aprovação de Resgates (`solicitacoes_resgate`), que estava causando inconsistência matemática no saldo do Administrador.

## Problema Raiz
Dois problemas distintos ocorriam simultaneamente:
1. **Falta de Debounce/Loading:** O botão "Confirmar Pagamento" não possuía um estado de bloqueio (`disabled`). Se o administrador clicasse duas vezes rapidamente, o React enviava duas chamadas para o backend antes de fechar o modal. Como a operação não possuía lock na transação da UI, a função `increment_admin_profit` era chamada duas vezes, debitando 20 em vez de 10.
2. **Cálculo Errado:** A função estava debitando `request.credits_requested` em vez do valor correto em reais `request.amount_to_receive`.

## Mitigações Implementadas
1. **Controle de Estado:** Adição de `isResolving` no componente `RedeemRequestsAdmin.tsx` para bloquear e desativar o botão imediatamente após o clique, prevenindo Race Conditions na UI.
2. **Correção Contábil:** O hook `useAdminData.ts` passou a usar a coluna correta (`amount_to_receive`) para descontar o saldo do administrador, garantindo fidelidade no livro-caixa.

## Histórico de Alterações
- **Data:** Atual
- **Alterações:** Modificação no `RedeemRequestsAdmin.tsx` e `useAdminData.ts`.
- **Motivo:** Garantir a integridade financeira do saldo da plataforma e blindar contra erros operacionais.