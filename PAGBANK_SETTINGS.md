# PagBank - Configurações

Este documento descreve os parâmetros de configuração necessários para a integração com o PagBank. Essas configurações são gerenciadas pelo administrador da plataforma na interface de administração.

## Modelo de Dados

As configurações são armazenadas na tabela `configuracoes` e definidas pela interface `GameSettings` no frontend.

```typescript
// src/types/match.ts

export interface GameSettings {
  // ... outras configurações
  pagbank_enabled?: boolean;
  pagbank_env?: 'sandbox' | 'producao';
  pagbank_token_sandbox?: string;
  pagbank_token_producao?: string;
  pagbank_pass_fees_to_customer?: boolean;
  pagbank_pix_fee_fixed?: number;
  pagbank_pix_fee_percentage?: number;
  pagbank_card_fee_fixed?: number;
  pagbank_card_fee_percentage?: number;
}
```

## Parâmetros de Configuração

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `pagbank_enabled` | `boolean` | Ativa ou desativa completamente a integração com o PagBank como método de pagamento. |
| `pagbank_env` | `'sandbox'` \| `'producao'` | Define o ambiente que será utilizado para as transações. `sandbox` para testes e `producao` para transações reais. |
| `pagbank_token_sandbox` | `string` | O token de autenticação (Bearer Token) fornecido pelo PagBank para o ambiente de **sandbox**. |
| `pagbank_token_producao`| `string` | O token de autenticação (Bearer Token) fornecido pelo PagBank para o ambiente de **produção**. |
| `pagbank_pass_fees_to_customer` | `boolean` | Se `true`, as taxas cobradas pelo PagBank serão repassadas ao cliente final, sendo adicionadas ao valor total da compra. |
| `pagbank_pix_fee_fixed` | `number` | A taxa **fixa** (em reais) cobrada pelo PagBank para transações via PIX. Ex: `0.99`. |
| `pagbank_pix_fee_percentage` | `number` | A taxa **percentual** cobrada pelo PagBank para transações via PIX. Ex: `1.0` para 1%. |
| `pagbank_card_fee_fixed`| `number` | A taxa **fixa** (em reais) cobrada pelo PagBank para transações via Cartão de Crédito. Ex: `0.40`. |
| `pagbank_card_fee_percentage` | `number` | A taxa **percentual** cobrada pelo PagBank para transações via Cartão de Crédito. Ex: `4.99` para 4.99%. |

## Interface de Administração

O administrador pode gerenciar essas configurações na tela "Configurações do Jogo", na seção "Gateway de Pagamento: PagBank". A interface permite:

- Ativar/Desativar o gateway.
- Selecionar o ambiente (Modo Teste / Modo Produção).
- Inserir os tokens de produção e sandbox (os tokens são armazenados de forma segura e não são expostos no frontend).
- Configurar o repasse de taxas.
- Definir os valores das taxas fixas e percentuais para PIX e Cartão.
