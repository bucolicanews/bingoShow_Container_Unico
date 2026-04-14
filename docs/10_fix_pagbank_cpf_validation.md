# Segurança e Confiabilidade - Validação de CPF do PagBank

## Problema Raiz
A API de `Orders` do PagBank exige que o campo `customer.tax_id` contenha um CPF ou CNPJ que seja **matematicamente válido**. O uso de uma string de zeros (ex: `00000000000`) como fallback para usuários anônimos resultava no erro `40002: must be a valid CPF or CNPJ`, bloqueando a geração de cobranças PIX na plataforma.

## Impacto
Impossibilidade de gerar cobranças de crédito ou venda de cartelas físicas para clientes que não preencheram o perfil ou que são anônimos na plataforma.

## Mitigação Implementada
1. **Edge Function (Backend):** A função agora exige estritamente um CPF real e validado por tamanho (11 ou 14). Se falhar, retorna o erro específico `CPF_REQUIRED`.
2. **Página de Compra de Créditos (Logado):** O usuário recebe um Toast Error com um atalho (`action`) redirecionando-o para a página `/account` (Meu Perfil) para que ele preencha seus dados reais e em conformidade.
3. **Página de Pagamento Físico (Anônimo):** Foi adicionado um `Input` para o pagador digitar seu CPF na hora da compra. Esse dado é repassado via `metadata` para a Edge Function, permitindo que visitantes externos gerem PIX validos no PagBank sem precisar criar conta.

## Resultado
Bloqueio de transações malformadas antes mesmo de atingirem o gateway bancário, mantendo o ambiente limpo de lixo na API e educando os clientes a manterem os dados em dia.