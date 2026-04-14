# Segurança e Governança - Chat de Resgate (Redeem Messages)

## Descrição
Correção do fluxo de inserção de mensagens para as solicitações de resgate e criação de interface de chat para o usuário. Ocorria um erro de *Foreign Key Constraint* porque o cliente não enviava o `admin_id` no payload.

## Problema Raiz
Na arquitetura Multi-Tenant, a tabela `mensagens_resgate` requer o `admin_id` para garantir que a mensagem pertença ao Tenant correto. Enviar esse ID pelo frontend é uma vulnerabilidade de Insecure Direct Object Reference (IDOR).

## Validações e Mitigações Implementadas
1. **Zero Trust (Banco de Dados):**
   Foi criado o trigger `trg_mensagens_resgate_admin` que intercepta qualquer `INSERT` na tabela de mensagens. Ele **ignora** qualquer `admin_id` enviado pelo frontend e consulta obrigatoriamente a tabela pai (`solicitacoes_resgate`) para descobrir a qual administrador aquela mensagem pertence.
2. **Disponibilidade (UX):**
   Adicionado o componente de Chat no modal de "Meus Resgates" (`MyRedeemRequestsDialog.tsx`), permitindo que o jogador leia os motivos da rejeição ou envie sua chave PIX com facilidade.

## Riscos Mitigados
- **IDOR / Bypass de Tenant:** O usuário não pode enviar mensagens para o chat de outros administradores forjando o payload.
- **Silencing Errors:** O erro que descartava as mensagens foi sanado, reestabelecendo a comunicação.

## Histórico de Alterações
- **Data:** Atual
- **Alterações:** 
  - Deploy da SQL Migration (0110) com o Trigger defensivo.
  - Atualização de `useRedeemRequests.ts` (exportando `fetchRedeemMessages`).
  - Reformulação visual de `MyRedeemRequestsDialog.tsx` com painel aninhado para o Chat.
- **Motivo:** Restabelecimento do canal de comunicação Admin-Usuário e blindagem da arquitetura multi-tenant.