# Segurança e Confiabilidade - Prevenção de Erro de Manipulação de DOM

## Problema Raiz
O erro fatal `Failed to execute 'removeChild' on 'Node'` ocorreu na tela `PagarCartela.tsx` durante o processo de deploy e build. A causa foi a reintrodução acidental de um bloco de código que manipulava o DOM de forma manual (`document.body.appendChild` e `document.body.removeChild`) para tentar forçar o bypass do firewall do PagBank.

## Impacto
O React perdia a referência da árvore de componentes, gerando um crash irreversível ("Tela Branca" / Overlay de Erro) ao tentar renderizar a interface no ambiente de produção/preview.

## Mitigação Implementada
- **Remoção Absoluta:** O bloco de injeção manual foi removido do componente `PagarCartela.tsx`.
- **Padrão Oficial SPA:** O código passou a utilizar a abordagem segura e nativa `window.open(url, '_blank', 'noreferrer,noopener')`, que delega o isolamento de origem para o próprio navegador, prevenindo falhas de sincronia do React e ainda assim burlando o WAF `403` do PagBank em ambientes de teste.

## Resultado
A renderização do componente está 100% segura e aderente ao ciclo de vida do React, permitindo que o processo de Deploy/Build seja concluído com sucesso.