# Segurança e UX - Banner de Atenção ao Usuário

## Descrição
Implementação de um alerta visual contínuo no Dashboard do Jogador (`Lobby.tsx`) para garantir que mensagens e recusas do Administrador não passem despercebidas.

## Problema Raiz
Quando um Administrador encontrava um problema na solicitação do usuário (ex: falta de chave PIX no resgate) e enviava uma mensagem, o status da solicitação mudava de `pending` para `rejected`.
O dashboard do usuário estava programado para notificar apenas sobre itens `pending`, fazendo com que a mensagem do admin ficasse oculta a menos que o usuário abrisse proativamente o menu "Histórico". Isso causava frustração e ruptura na comunicação.

## Mitigações Implementadas (UX & Flow)
1. **Contabilidade de Status Rejected:** 
   O `Lobby.tsx` agora varre os arrays `creditRequests` e `redeemRequests` em busca de itens com status `rejected` (`myRejectedCreditsCount` e `myRejectedRedeemsCount`).
2. **Alert Banner Vermelho (Destructive):**
   Adicionado um banner fixo no topo do Dashboard com cor `destructive`, alertando de forma clara: *"Você tem mensagens do Admin / Pendências."*
3. **Instruções Diretas:**
   A mensagem instrui o jogador a abrir o Histórico para responder e sanar o bloqueio.

## Riscos / Observações
- A exibição do banner não expõe os dados sensíveis do erro diretamente no Lobby (Prevenção contra over-sharing de dados). O jogador ainda precisa se autenticar e abrir o modal de histórico para ler o conteúdo da mensagem e interagir com o chat, garantindo que o contexto seguro seja respeitado.

## Histórico de Alterações
- **Data:** Atual
- **Alterações:** Adição das lógicas `myRejectedCreditsCount`, `myRejectedRedeemsCount` e `hasMyAttentionRequired` no componente `Lobby.tsx`. Renderização condicional do novo Banner Vermelho.
- **Motivo:** Fechamento do loop de comunicação entre usuário e administrador nas resoluções de tickets financeiros.