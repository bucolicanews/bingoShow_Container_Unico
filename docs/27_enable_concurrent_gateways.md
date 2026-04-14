# Habilitação Concorrente de Gateways (Stripe + PagBank)

## Descrição
Foi revogada a regra de negócio que impedia o Stripe de ser renderizado simultaneamente com o PagBank. A alteração atende a uma solicitação administrativa para oferecer maior flexibilidade de pagamentos aos usuários, permitindo que ambos os gateways funcionem como redundância um do outro na mesma tela de checkout.

## Arquivos Modificados
- `src/components/CreditRequestDialog.tsx`
- `src/pages/PagarCartela.tsx`

## Fluxo (Como funciona agora)
1. O sistema busca o objeto `gameSettings` do banco de dados.
2. O bloco UI do PagBank é exibido caso `gameSettings.pagbank_enabled` seja `true`.
3. O bloco UI do Stripe é exibido caso `gameSettings.stripe_enabled` seja `true`.
4. Ambos os blocos possuem cálculos independentes de taxa (`pagbank_pass_fees_to_customer` e `stripe_pass_fees_to_customer`). O usuário pode escolher livremente em qual botão clicar.

## Segurança (Application Security)

<div id="sec01">
# Segurança - Exibição Concorrente de Métodos de Pagamento

## Tipo de Entrada
- Configurações Booleanas de Ativação de Gateway.

## Validações Aplicadas
- O Frontend apenas exibe as opções. A validação de origem, cálculo da taxa e processamento do link de checkout ocorrem de forma isolada pelas Edge Functions (`create-pagbank-payment` e `create-stripe-session`), mantendo a abordagem Zero Trust.

## Riscos Identificados
- **Conflito Visual/Cognitivo:** O usuário poderia se confundir com dois botões descritos como "Cartão de Crédito".

## Mitigações Implementadas
- **Identidade Visual:** O bloco do Stripe recebeu estilização única (cores e badge `bg-indigo-600`), acompanhado da label explícita "Cartão (Stripe)", enquanto o PagBank manteve as cores azul/verde originais. Isso sinaliza visualmente a distinção entre os processadores.
</div>

## Histórico de Alterações
- Data: Atual
- Alteração: Remoção da cláusula `!gameSettings?.pagbank_enabled` das validações de renderização do Stripe.
- Motivo: Solicitação direta para oferecer contingência de gateways ao usuário final.