# Correção de Estabilidade - ReferenceError do Stripe Fee

## Descrição do Problema
Ao ativar a opção do Stripe juntamente com o PagBank, a tela de Pagar Cartela apresentou o erro `Uncaught ReferenceError: stripeFeeDetails is not defined`. Isso impedia que a tela fosse carregada.

## Causa Raiz
Na reestruturação do componente para acomodar as 3 formas de pagamento simultâneas, a definição condicional do bloco de taxas do Stripe (que calcula e exibe a mensagem de acréscimo) foi acidentalmente suprimida, enquanto a UI ainda solicitava o dado para renderização.

## Mitigação
A variável `stripeFeeDetails` e seu cálculo `useMemo` correspondente foram restaurados no corpo do componente, lendo diretamente das configurações do banco de dados e estabilizando a interface de usuário.

## Histórico de Alterações
- Data: Atual
- Arquivos: `src/pages/PagarCartela.tsx`.
- Motivo: Tratamento de Fallback UI e estabilidade de Tela.