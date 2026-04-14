# Segurança e Confiabilidade - Correção de Validação de CPF para Usuários Logados

## Problema Raiz
Ao gerar pagamentos via PagBank, usuários logados que possuíam o campo CPF preenchido de forma incompleta ou falsa no perfil (ex: `000.000.000-00`) geravam um erro interno na Edge Function. O PagBank devolvia `40002: must be a valid CPF or CNPJ`. Esse erro não era repassado adequadamente para o frontend, gerando a mensagem "Erro ao gerar PIX PagBank: must be a valid CPF or CNPJ".

## Mitigação Implementada
1. **Frontend (`CreditRequestDialog.tsx`):**
   - Adicionado campo de CPF visível dentro do modal de solicitar créditos para usuários logados.
   - O campo vem pré-preenchido com os dados do perfil, permitindo que o usuário visualize e corrija facilmente.
   - Tratamento de erro específico para exibir `toast.error` se o backend apontar inconsistência (`CPF_REQUIRED`).
2. **Backend (`create-pagbank-payment`):**
   - Interceptação de respostas de erro da API do PagSeguro contendo "CPF", "CNPJ" ou "40002".
   - O backend lança uma exceção padronizada (`CPF_REQUIRED`) para o frontend lidar.
   - Se o usuário enviar um CPF válido na hora da compra, a Edge Function já aproveita a oportunidade para limpar os dados sujos e gravar o novo CPF no banco de dados de perfis (`perfis`).

## Resultado
Prevenção da quebra do funil de vendas, melhoria da usabilidade permitindo a correção "in-place" e aumento da integridade do banco de dados (higienização de CPFs).