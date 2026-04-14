# Segurança e Governança - Tratamento Restrito de Erros (PagBank API)

## Problema Raiz
Ao interagir com a API de `/checkouts` ou `/orders` do PagSeguro com dados inválidos (como CPF inconsistente ou malformado), a API externa devolve erro HTTP `400`. Nossa Edge Function repassava este status HTTP `400` diretamente para o Frontend. O framework Supabase e o navegador registravam isso como `Failed to load resource: the server responded with a status of 400`, impedindo a função `fetch` no cliente de ler elegantemente a mensagem `{error: "CPF_REQUIRED..."}`.

## Impacto
A tela exibia alertas ruidosos e os usuários eram interrompidos sem um direcionamento claro (como o Toast alertando "Corrija seu CPF"), prejudicando as conversões e gerando fricção.

## Mitigação Implementada (Fail Safe Control)
1. **Contenção do Status Code:** A Edge Function `create-pagbank-payment` agora envelopa todo o bloco `try/catch` principal. Qualquer exceção gerada pela regra de negócios (como CPF inválido) ou por recusa da API do PagBank será empacotada em uma resposta HTTP `200 OK`, mas com o payload `{ success: false, error: 'MOTIVO...' }`.
2. **Atualização da UX:** O componente `CreditRequestDialog.tsx` foi atualizado. Ele agora lê explicitamente a propriedade `success` da resposta da Edge Function. Caso seja `false`, ele exibe a Toast específica sem estourar o console do navegador.
3. **Inputs Otimizados:** O campo `Seu CPF` agora fica localizado numa área global de *Identificação*, em cima dos botões de pagamento, permitindo que a alteração seja refletida em ambos os métodos (PIX e Cartão). O CPF é verificado e formatado antes do envio.

## Resultado
Erros são tratados graciosamente. O usuário é avisado com precisão que precisa corrigir seus dados, e ao preencher, seu cadastro é atualizado de imediato, e o pagamento flui.