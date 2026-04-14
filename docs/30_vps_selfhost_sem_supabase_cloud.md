# VPS Self-Host Sem Supabase Cloud

Este modo sobe tudo na sua VPS, sem depender de Supabase Cloud.

## Resumo objetivo

- O app roda em container (Docker).
- O Supabase local roda na propria VPS via `supabase start`.
- O frontend e compilado apontando para a URL publica do Supabase na VPS.

## Comando unico para subir tudo

Na VPS, na raiz do projeto:

```bash
npm run vps:selfhost:up
```

Esse comando faz:

1. `supabase start`
2. Gera `.env.production` com URL/anon key local (`npm run vps:env`)
3. Garante admin padrao (`npm run local:admin`)
4. Sobe app container (`npm run docker:up`)

Para desligar tudo:

```bash
npm run vps:selfhost:down
```

## Variavel obrigatoria para clientes externos

Antes do `vps:selfhost:up`, defina a URL publica do Supabase da sua VPS:

```bash
export VPS_SUPABASE_PUBLIC_URL="https://SEU-DOMINIO-OU-IP:54321"
```

No Windows PowerShell:

```powershell
$env:VPS_SUPABASE_PUBLIC_URL = "https://SEU-DOMINIO-OU-IP:54321"
```

Se nao definir, o script usa `http://127.0.0.1:54321` (serve so local).

Opcional para live:

```bash
export VPS_LIVE_SERVER_URL="https://SEU-DOMINIO"
```

## Cadastro de clientes e e-mail (sem cloud)

No modo `supabase start` local, o Auth usa Inbucket (Mailpit local), nao e envio real para internet.

Para enviar e-mail real de confirmacao/recuperacao sem Supabase Cloud, voce precisa migrar para Supabase self-host completo (docker stack oficial com GoTrue configurado com SMTP real).

Com o setup atual (`supabase start`), o fluxo de e-mail funciona para testes locais, nao para producao internet.

## Aviso importante de producao

`supabase start` e orientado para desenvolvimento local e expoe servicos com defaults inseguros.

Se for operar clientes reais em producao sem Supabase Cloud, o recomendado e:

1. Stack oficial self-host do Supabase (multi-container dedicado)
2. SMTP real configurado
3. Hardening de rede e secrets

## EasyPanel

No EasyPanel, voce pode usar o comando `npm run vps:selfhost:up` no bootstrap da aplicacao.

Se quiser robustez de producao, use dois apps/servicos no painel:

1. stack Supabase self-host oficial
2. app Bingo (este repositorio)
