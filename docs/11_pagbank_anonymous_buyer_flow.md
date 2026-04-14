# UX e Segurança - Fluxo de Pagamento Anônimo (Venda Avulsa/Link)

## Descrição
Melhoria na jornada do usuário anônimo (cliente de rua/link público) ao tentar pagar uma cartela de rifa ou folha de bingo físico através da API do PagBank.

## O Problema
No fluxo de webhook (API-to-API), a transação é aprovada silenciosamente sem passar pelo formulário de "Validar Cartela" que antes exigia o nome e envio de comprovante. Isso criava um cenário onde o PagBank recebia o PIX, ativava a cartela, mas a cartela ficava sem titularidade (órfã) no painel de controle, impedindo o Administrador de contatar o ganhador. Além disso, a API do PagBank gerava o erro 400 por falta de CPF.

## Solução Implementada
Foi invertida a ordem da coleta de dados. Agora, o sistema usa o princípio de "Garantia Antecipada":
1. **Frontend (`PagarCartela.tsx`):** O usuário anônimo é obrigado a preencher um formulário (`Nome`, `WhatsApp` e `CPF`) logo acima do botão "Gerar PIX".
2. **Transferência de Dados:** Esses dados são enviados à Edge Function `create-pagbank-payment` através do objeto `metadata`.
3. **Persistência Pré-Pagamento (Backend):** A Edge Function usa a `Service Role Key` para sobrepor o bloqueio do banco e gravar esses dados temporariamente nas tabelas (`vendas_bingo_fisico` ou `numeros_rifa`) antes mesmo de conectar ao banco PagSeguro.
4. **Resolução de Automação:** Quando o usuário escaneia o QR Code gerado, o webhook do PagBank apenas envia o sinal de `PAID`. Como os dados de identificação já estão injetados na cartela, o fluxo termina perfeitamente e o administrador já pode visualizar quem comprou no painel.

## Histórico de Alterações
- Data: Atual
- Alteração: Adaptação visual da página `PagarCartela.tsx` (Adição dos inputs Nome/Tel) e instrução `update` na Edge Function.
- Motivo: Conciliação de UX com a automação de recebimentos do PagBank (Fechamento do laço de identificação do comprador).