# Segurança e Governança - Repasse de Taxas e Checkout PagBank

## Descrição
Implementação de regras de negócio para repassar taxas bancárias do PagBank (PIX e Cartão de Crédito) aos clientes. Também restaura a opção de "PIX Manual" como um fallback (plano B) sempre visível, permitindo que os clientes escolham entre a comodidade imediata ou o processo manual mais demorado.

## Alterações de Banco de Dados
- Adição das colunas `pagbank_pass_fees_to_customer`, `pagbank_pix_fee_fixed`, `pagbank_pix_fee_percentage`, `pagbank_card_fee_fixed`, `pagbank_card_fee_percentage` na tabela `configuracoes`.

## Regras de Segurança (Application Security)
### Prevenção de Fraude de Preço (Price Tampering)
- **Risco:** Um usuário malicioso intercepta a requisição do frontend e altera o `amount` enviado à Edge Function, tentando pagar um valor menor sem incluir as taxas.
- **Mitigação:** O frontend exibe uma *simulação* da taxa apenas para UX. A Edge Function `create-pagbank-payment` lê a configuração direto do banco de dados (ignorando o frontend) e recalcula o valor real (Bruto + Taxa PIX ou Bruto + Taxa Cartão) no momento de gerar a cobrança no gateway.

### Integração Checkout (Cartão de Crédito)
- Utilização do endpoint `/checkouts` da API do PagSeguro quando o cliente seleciona "Cartão de Crédito". O sistema não transaciona ou toca em dados de cartão de crédito (PCI-DSS Compliance garantido), limitando-se a redirecionar o usuário para o ambiente seguro do banco.

## Histórico de Alterações
- Data: Atual
- Arquivos afetados: Database Schema, `SettingsManager.tsx`, `CreditRequestDialog.tsx`, `PagarCartela.tsx`, `create-pagbank-payment/index.ts`.