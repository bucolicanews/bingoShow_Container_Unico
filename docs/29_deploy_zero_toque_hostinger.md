# Deploy Zero Toque - Hostinger (1 container)

Este guia publica somente a aplicacao Node/React em 1 container na Hostinger.
O Supabase fica remoto (Supabase Cloud), que e o modelo correto para producao.

## 1) Como os clientes fazem cadastro (com e-mail)

O cadastro e feito pelo Supabase Auth.
Para enviar e-mail real (confirmacao, reset de senha), configure SMTP no projeto Supabase Cloud.

Passos no Supabase Dashboard:

1. Abra seu projeto remoto.
2. Va em Authentication > Email.
3. Ative Confirm email (recomendado em producao).
4. Configure SMTP customizado (SendGrid, Resend, Mailgun, SMTP Hostinger, etc).
5. Salve e teste envio de e-mail.

Sem SMTP customizado, o envio fica limitado e nao e confiavel para producao.

## 2) Variaveis de ambiente de producao

No servidor (ou no repo de deploy), crie `.env.production` com base em `.env.production.example`.

Campos obrigatorios:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Opcional:

- `VITE_LIVE_SERVER_URL` (URL publica do seu servidor para live/Socket.IO)

## 3) Comando unico de bootstrap para maquina nova

Execute na raiz do projeto:

```bash
npm run bootstrap:new
```

Esse comando:

1. Instala dependencias com `npm ci`.
2. Cria `.env.production` automaticamente se ainda nao existir (a partir de `.env.production.example`).

## 4) Script de build da imagem

```bash
npm run docker:build
```

A imagem gerada e `bingo-buddy:latest`.

## 5) Deploy zero toque (subir/atualizar)

Depois de preencher `.env.production`, rode:

```bash
npm run docker:up
```

Isso executa `docker compose up -d --build` e sobe o container da aplicacao.

Para parar:

```bash
npm run docker:down
```

## 6) Replicar para qualquer cliente

Para cada cliente, voce replica assim:

1. Criar projeto Supabase Cloud proprio do cliente.
2. Configurar SMTP no Supabase desse cliente.
3. Preencher `.env.production` do cliente com URL/KEY do projeto dele.
4. Rodar `npm run docker:up`.

Resultado: um container da aplicacao por cliente, cada um apontando para seu Supabase remoto.

## 7) Observacao importante sobre Supabase local

`supabase start` e apenas para desenvolvimento local.
Ele sobe varios servicos Docker e nao e o modelo ideal para "1 container unico" em producao.

Para Hostinger 1 container, use sempre Supabase remoto + app container.
