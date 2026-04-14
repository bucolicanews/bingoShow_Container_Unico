# Correção de Estabilidade - Erro de Manipulação de DOM (removeChild)

## Descrição
Documentação da correção do erro fatal `Failed to execute 'removeChild' on 'Node'`. O erro ocorria por dois motivos principais:
1. Manipulação manual de elementos `<a>` fora do ciclo de vida do React.
2. Uso de `index` como `key` em listas dinâmicas de fotos, causando inconsistência na árvore de elementos durante atualizações.

## Mitigações Implementadas
1. **Redirecionamento Seguro:** Substituição de `document.createElement('a')` por `window.open(url, '_blank', 'noreferrer,noopener')`.
2. **Keys Únicas:** Atualização de todos os componentes de lista (especialmente em `RifasAdmin.tsx` e `RifaDetalheAdmin.tsx`) para utilizar identificadores únicos (ex: `url-index`) em vez de apenas o índice numérico.

## Riscos Mitigados
- **Crash da aplicação (Tela Branca):** Eliminação de conflitos entre o motor de renderização do React e scripts de terceiros ou manipulações manuais.
- **Inconsistência de Dados na UI:** Garante que a remoção de um item de uma lista não afete a renderização dos itens vizinhos.

## Histórico de Alterações
- **Data:** Atual
- **Alteração:** Refatoração de keys em listas e remoção de manipulação manual de DOM.
- **Motivo:** Erro de execução `removeChild` reportado em ambiente de produção.