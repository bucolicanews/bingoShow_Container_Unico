# Segurança e Confiabilidade - Tratamento Avançado de Erros no Checkout

## Problema Raiz
Ao gerar pagamento por Cartão (Checkout API do PagBank), se os dados fornecidos fossem rejeitados pelas restrições do banco, a Edge Function respondia `status: 400`. Devido à arquitetura do fetch, o navegador encerrava a solicitação abruptamente, resultando no bloqueio da UI e na exibição incorreta do alerta: "Sua conexão caiu. Por favor, atualize a página (F5)". O erro verdadeiro do PagBank (ex: "Nome incompleto" ou "Telefone mal formatado") era perdido.

## Mitigação Implementada
- **Status 200 Constante:** A Edge Function foi revisada para, mesmo em caso de erro, responder com um HTTP 200 contendo o objeto `{ success: false, error: "..." }`. Isso previne o acionamento do gatilho de "falha de rede" do frontend.
- **Parser de Telefone DDI:** A função Deno agora varre o WhatsApp do usuário e recorta códigos de país (como o `55`) que vinham agrupados na string, separando perfeitamente o código de área (`phoneArea`) e o número local (`phoneNumber`), requisitos mandatórios do PagBank para Cartão de Crédito.
- **Frontend Refatorado:** O bloco `catch` no frontend (tanto para Rifa avulsa quanto para créditos) agora diferencia erros de lógica (`data.error`) de erros de infraestrutura (`TypeError: Failed to fetch`).

## Resultado
Erros bancários são reportados com clareza (ex: "CPF Inválido") sem travar ou induzir o usuário a reiniciar o aplicativo.