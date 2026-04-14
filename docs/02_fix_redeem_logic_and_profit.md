# Correção da Lógica de Resgate e Fluxo de Caixa

## Descrição
Ajuste no fluxo financeiro de resgate de créditos para evitar estornos indevidos e garantir que o lucro do administrador (caixa) seja atualizado corretamente após o pagamento de um prêmio.

## Entradas (Ação do Admin)
- `requestId`: ID da solicitação.
- `status`: 'approved' ou 'rejected'.
- `receiptFile`: Arquivo de comprovante (obrigatório para aprovação).

## Fluxo de Execução (Aprovação)
1. O administrador anexa o comprovante e clica em confirmar.
2. O sistema realiza o upload do arquivo para o storage.
3. **Novo Passo:** O sistema invoca `increment_admin_profit` com valor **negativo** (ex: -10.00), subtraindo o valor pago do caixa da plataforma.
4. O status da solicitação muda para `approved`.
5. Os créditos do jogador permanecem deduzidos (já foram retirados na solicitação).

## Fluxo de Execução (Rejeição/Mensagem)
1. O administrador clica no "X" para enviar uma mensagem de erro ou dúvida.
2. O status muda para `rejected`.
3. **Correção:** O sistema **NÃO** devolve os créditos ao jogador automaticamente. Os créditos ficam "retidos" até que o administrador decida aprovar ou excluir a solicitação.

## Dependências
- RPC `increment_admin_profit`
- Tabela `solicitacoes_resgate`
- Tabela `configuracoes`

## Segurança - Mitigation de Vulnerabilidades (sec02)
- **Prevenção de Inflação:** Ao remover o estorno automático no "X", evitamos que jogadores manipulem o sistema para duplicar saldo através de solicitações malformadas.
- **Rastreabilidade de Caixa:** A subtração do lucro garante que o administrador tenha uma visão real do dinheiro disponível, evitando que prêmios pagos continuem contando como lucro.

## Histórico de Alterações
- **Data**: Atual
- **Alteração**: Remoção de `updatePlayerCredits` no bloco de rejeição e inclusão de débito no `admin_profit` no bloco de aprovação.
- **Motivo**: Correção de erro grave de lógica financeira reportado pelo usuário.