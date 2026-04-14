# Módulo: Integração PagBank (Frontend Admin)

## Descrição
Adição da interface visual no Painel do Administrador (`SettingsManager.tsx`) para permitir o gerenciamento das chaves de API do PagBank e a ativação da funcionalidade de cobrança automática via PIX.

## Arquivos Afetados
- `src/types/match.ts`: Adicionada tipagem para as variáveis `pagbank_enabled`, `pagbank_env`, `pagbank_token_sandbox`, `pagbank_token_producao`.
- `src/hooks/useGameSettings.ts`: Modificado para carregar e enviar os novos campos do PagBank junto com as configurações de sistema.
- `src/components/admin/SettingsManager.tsx`: Inclusão do módulo visual de configuração do PagBank, utilizando os componentes Tailwind+RadixUI.

## Mitigações de Segurança
- Os campos de token (`pagbank_token_sandbox` e `pagbank_token_producao`) foram configurados como `type="password"`. Isso previne o "shoulder surfing" (roubo de credencial visual por pessoas próximas à tela do admin).
- O salvamento destas configurações aciona a RPC `update_game_settings` que foi ajustada na Fase 1 para ser acessível exclusivamente por Administradores validados.

## Histórico de Alterações
- Data: Atual
- Alteração: Update no `SettingsManager` e tipos globais.
- Motivo: Fase 2 da integração do PagBank (Frontend Configuration).