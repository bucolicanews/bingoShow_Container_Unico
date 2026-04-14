# Segurança e Governança - Geração de Pagamento PagBank (Frontend -> Edge)

## Descrição
Implementação da Função Deno (`create-pagbank-payment`) e renderização do QR Code Dinâmico do PagBank nas interfaces de usuário (`CreditRequestDialog` e `PagarCartela`).

## Tipo de Entrada
- Dados de transação enviados pelo cliente: `amount` (valor em R$), `type` (tipo de venda), `metadata` (IDs adicionais), `admin_id`.

## Validações Aplicadas
- O backend recalcula o `unit_amount` convertendo o valor em centavos matematicamente seguros (`Math.round(amount * 100)`).
- A requisição para a API *Orders* do PagBank exige o CPF do pagador via PIX. Se o usuário for anônimo ou não possuir CPF, é enviado um fallback de `00000000000` para prevenir falhas estritas da API de terceiros.
- Utilização estrita do `reference_id` gerado via Edge (`${type}_${Date.now()}_[hash]`) garantindo id unique e prevenindo dupla-postagem de webhook.

## Sanitização
- Metadata e valores monetários são tipados e formatados na Edge Function, ignorando possíveis manipulações DOM que o frontend poderia realizar.

## Riscos Identificados
- **Geração Massiva de PIX:** Um usuário malicioso poderia inundar a API chamando o botão de gerar diversas vezes.
- **Exposição de Chaves PagBank:** As chaves de acesso (`token`) da plataforma poderiam ser vazadas se o frontend fosse responsável pela criação do PIX.

## Mitigações Implementadas
- Inclusão do estado `isPagbankLoading` no frontend desativando o botão permanentemente após a geração, deixando o QR Code exposto de forma estática.
- Comunicação feita via **Edge Function isolada** usando *Service Role Key*. O navegador do cliente não tem contato com os Tokens Sandbox/Produção do PagBank, apenas com a imagem de retorno.

## Testes Realizados
- Criação de Order (Pagamento PIX) verificando ambiente Sandbox.
- Resposta de sucesso capturando `image/png` link de QR Code gerado pelo Pagseguro.

## Histórico de Alterações
- Data: Atual
- Arquivos: `supabase/functions/create-pagbank-payment/index.ts`, `CreditRequestDialog.tsx`, `PagarCartela.tsx`.
- Motivo: Fase 3 da implementação do PagBank (Geração Segura de Cobrança C2B).