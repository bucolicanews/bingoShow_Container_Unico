# LAN Privada com HTTPS (PC + celular)

Este setup permite acessar o sistema na rede privada e usar camera/microfone da live.

## O que foi configurado

1. Proxy HTTPS interno com Caddy.
2. Dominio da app: `https://bingo.lan`.
3. Dominio do Supabase local: `https://supabase.lan`.
4. Certificado interno gerado automaticamente pelo Caddy (`tls internal`).

Arquivos:

- [docker-compose.yml](docker-compose.yml)
- [Caddyfile](Caddyfile)
- [package.json](package.json)

## Subir tudo

Na raiz do projeto:

```bash
npm run lan:https:up
```

Esse comando executa:

1. `supabase start`
2. Gera `.env.production` com:
   - `VITE_SUPABASE_URL=https://supabase.lan`
   - `VITE_LIVE_SERVER_URL=https://bingo.lan`
3. `docker compose up -d --build` (app + caddy)

Para desligar:

```bash
npm run lan:https:down
```

## DNS interno na rede

Voce precisa fazer `bingo.lan` e `supabase.lan` apontarem para o IP do servidor na LAN.

Opcao A (recomendado): DNS no roteador

- Crie registros A:
  - `bingo.lan` -> IP do servidor (exemplo: 192.168.1.218)
  - `supabase.lan` -> mesmo IP

Opcao B: editar hosts em cada dispositivo

- Windows: `C:\Windows\System32\drivers\etc\hosts`
- Linux/macOS: `/etc/hosts`
- Android/iOS: preferir DNS no roteador (hosts local e limitado)

Entrada exemplo:

```text
192.168.1.218 bingo.lan supabase.lan
```

## Confiar no certificado interno (obrigatorio para live em celular)

Depois do primeiro `lan:https:up`, o certificado raiz fica em:

`infra/caddy/data/caddy/pki/authorities/local/root.crt`

Instale esse certificado como autoridade confiavel nos dispositivos clientes.

Sem isso, o navegador vai marcar HTTPS como nao confiavel e pode bloquear camera/microfone.

## Validacao rapida

1. Acesse `https://bingo.lan` no PC e celular.
2. Login e abra a transmissao.
3. No broadcaster, permita camera/microfone.
4. Viewer em outro dispositivo deve assistir normalmente.

## Observacao

- O Supabase continua local/self-host no seu servidor.
- Nao depende de Supabase Cloud.
- Este setup e para rede privada com certificados internos.

## Variante sem live para celular

Se voce quer apenas abrir a app no celular com nome personalizado e nao precisa de live/camera, use:

```bash
npm run lan:mobile:up
```

Alias equivalente:

```bash
npm run docker:up:mobile
```

Esse modo gera:

- `http://bingo.up`
- `http://bingo.up/supabase`
- `VITE_LIVE_SERVER_URL` vazio

Fluxo executado por esse comando:

1. `supabase start`
2. `node scripts/write-local-env.mjs`
3. `node scripts/bootstrap-local-admin.mjs`
4. `node scripts/write-vps-local-env.mjs`
5. `docker compose up -d --build`

Ainda assim, o DNS da rede precisa apontar `bingo.up` para o IP do servidor LAN.
