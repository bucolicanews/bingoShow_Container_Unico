# Log de Alterações (Changelog)

## [Atual] - Coexistência de Gateways e Estabilidade

### Alterações
- **Gateways Simultâneos:** Removida a restrição que ocultava a opção Stripe quando o PagBank estava ativo nas telas `CreditRequestDialog` e `PagarCartela`.
- **UI/UX:** Adicionada identidade visual em roxo/índigo para o Stripe a fim de diferenciá-lo claramente do PagBank perante os usuários.
- **Documentação:** Criado o arquivo `docs/27_enable_concurrent_gateways.md` abordando as implicações da mudança.

### Motivo
- Solicitação para permitir contingência de opções de pagamento (Cartão Nacional x Cartão Internacional) de forma simultânea.

### Impactos
- **Esperados:** Aumento da taxa de conversão em pagamentos por cartão, pois usuários que por ventura forem rejeitados pelo antifraude do PagSeguro podem imediatamente tentar pagar via Stripe na mesma tela.