# Bingo Buddy

Guia completo de instalacao, execucao e operacao do projeto em:

- modo local de desenvolvimento
- modo LAN com HTTPS para PC e celular
- modo VPS self-host sem Supabase Cloud
- modo Hostinger com app em container + Supabase Cloud

## Visao Geral

O Bingo Buddy e uma aplicacao web com:

- frontend React + Vite + TypeScript
- backend Node.js (Express + Socket.IO)
- banco e autenticacao via Supabase
- live streaming com WebRTC (sinalizacao por Socket.IO)

## Stack de Software e Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 18, Vite 5, TypeScript |
| UI | Tailwind CSS, shadcn/ui, Radix UI |
| Data fetching | TanStack Query |
| Backend HTTP | Node.js + Express |
| Realtime/Lives | Socket.IO + WebRTC |
| Banco/Auth/Storage | Supabase (Postgres, Auth, Realtime, Storage) |
| Containerizacao | Docker + Docker Compose |
| Proxy HTTPS LAN | Caddy 2.8 (`tls internal`) |

## Arquitetura de Execucao

- `server.js`: servidor Node em `PORT=8082`
- frontend buildado em `dist` e servido pelo Node
- Supabase local executado pelo `supabase start` (containers gerenciados pela CLI)
- `docker-compose.yml` sobe:
  - `app_bingo` (aplicacao)
  - `caddy_lan` (proxy HTTPS para `bingo.lan` e `supabase.lan`)

## Porta Padrao da Aplicacao

- a aplicacao dentro do container escuta na porta `8082`
- a imagem Docker publicada expoe `8082/tcp`
- se quiser acessar pelo navegador sem proxy reverso, use `http://localhost:8082`

Mapeamento recomendado:

- host `8082` -> container `8082`

Exemplo correto:

```bash
docker run -d -p 8082:8082 --name bingo_app bacudigital/bingo_show:v1
```

Exemplos incorretos para esta imagem:

- `-p 3000:3000`
- `-p 8080:8080`

Esses mapeamentos nao funcionam porque a aplicacao nao escuta em `3000` nem em `8080` dentro do container.

## Imagem Docker Publicada

Essa imagem ja sobe tudo que pertence a aplicacao:

- backend HTTP em Node/Express
- frontend buildado em `dist`
- fallback SPA para rotas como `/login`
- Socket.IO usado pela live/sinalizacao

Ou seja: ao iniciar o container, o `server.js` ja entrega frontend, API HTTP e live na mesma porta `8082`.

Pull da imagem padrao:

```bash
docker pull bacudigital/bingo_show:v1
```

Run padrao:

```bash
docker run -d -p 8082:8082 --name bingo_app bacudigital/bingo_show:v1
```

Ver logs:

```bash
docker logs -f bingo_app
```

Parar e remover o container:

```bash
docker stop bingo_app
docker rm bingo_app
```

Se quiser trocar a porta externa da maquina, mantenha `8082` no lado do container.

Exemplo:

```bash
docker run -d -p 80:8082 --name bingo_app bacudigital/bingo_show:v1
```

## localhost vs bingo.lan

Se voce quer apenas baixar a imagem e abrir a aplicacao, use:

```text
http://localhost:8082
```

Se `http://localhost:8082/login` abre, significa que a imagem esta correta e o frontend, HTTP e live estao subindo no mesmo processo.

`https://bingo.lan` e outro modo de execucao. Ele depende de tres itens extras:

1. container `caddy` rodando na porta `443`
2. `bingo.lan` apontando para o IP da maquina
3. certificado interno do Caddy instalado como confiavel

Sem isso, `bingo.lan` nao abre mesmo que `localhost:8082` esteja funcionando.

## Rodar Imagem Publicada com Caddy

Para usar a imagem pronta com proxy HTTPS local, foi adicionado o arquivo `docker-compose.published.yml`.

Subir:

```bash
docker compose -f docker-compose.published.yml up -d
```

Parar:

```bash
docker compose -f docker-compose.published.yml down
```

Esse compose:

- baixa e roda `bacudigital/bingo_show:v1`
- sobe o Caddy para responder em `https://bingo.lan`
- publica a app em `http://localhost:8082`

Mesmo assim, `bingo.lan` so funciona se o DNS/hosts e o certificado estiverem configurados.

## Requisitos por Sistema Operacional

### Windows 10/11

Instalar:

1. Git
2. Node.js 20 LTS (ou superior compativel)
3. Docker Desktop (com Docker Compose)
4. Supabase CLI

Comandos para validar:

```powershell
git --version
node -v
npm -v
docker --version
docker compose version
supabase --version
```

### Linux (Ubuntu/Debian/Fedora)

Instalar:

1. Git
2. Node.js 20 LTS
3. Docker Engine + Docker Compose plugin
4. Supabase CLI

Validar com os mesmos comandos acima.

### macOS

Instalar:

1. Git (Xcode Command Line Tools ou Homebrew)
2. Node.js 20 LTS
3. Docker Desktop
4. Supabase CLI

Validar com os mesmos comandos acima.

## Primeiro Setup (maquina nova)

Na raiz do projeto:

```bash
npm run bootstrap:new
```

Esse comando:

1. instala dependencias (`npm ci`, com fallback para `npm install`)
2. cria `.env.production` a partir de `.env.production.example` quando necessario

## Passo a Passo Local Completo

Se voce baixou o projeto e quer deixar tudo funcionando localmente com banco, Supabase local, app e acesso LAN mobile, siga exatamente esta ordem.

### 1. Instalar os requisitos

Confirme que estas ferramentas estao instaladas:

```powershell
git --version
node -v
npm -v
docker --version
docker compose version
supabase --version
```

### 2. Baixar o projeto

```bash
git clone <URL_DO_REPOSITORIO>
cd bingo-buddy
```

### 3. Instalar dependencias

```bash
npm install
```

Se preferir o bootstrap automatizado:

```bash
npm run bootstrap:new
```

### 4. Subir tudo localmente

Para subir banco local, Supabase local, admin padrao, app e proxy LAN mobile:

```bash
npm run lan:mobile:up
```

Alias equivalente:

```bash
npm run docker:up:mobile
```

Esse comando faz:

1. sobe o Supabase local
2. gera `.env.local`
3. cria o admin padrao
4. gera `.env.production` para o modo mobile
5. sobe `app_bingo` e `caddy_lan`

### 5. Acessar a aplicacao


   #### EMCADA PC WINDOS 

Sem DNS configurado na rede:

- use `http://192.168.1.218:8082` ou o IP/porta da maquina onde a stack subiu

Com DNS local configurado no roteador ou servidor DNS:

- use `http://bingo.up`

Para o dominio personalizado funcionar no celular, a rede precisa resolver:

- `bingo.up` -> IP da maquina
- `supabase.up` -> IP da maquina

### 6. Login do admin padrao

- email: `admin@bingo.local`
- senha: `Admin123456!`

### 7. Parar tudo

```bash
npm run lan:mobile:down
```

Alias equivalente:

```bash
npm run docker:down:mobile
```

## Variaveis de Ambiente

### `.env.local` (desenvolvimento)

Gerado automaticamente por:

```bash
npm run local:env
```

Campos usados:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### `.env.production` (container/producao)

Gerado por:

```bash
npm run vps:env
```

Campos:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_LIVE_SERVER_URL`
- `PORT`

Exemplo base: `.env.production.example`.

## Comandos Principais

| Comando | Funcao |
| --- | --- |
| `npm run dev` | Frontend local (Vite) |
| `npm run server` | Backend Node (live/sinalizacao) |
| `npm run dev:full` | Sobe backend + frontend juntos |
| `npm run s-start` | Sobe Supabase local + gera `.env.local` + cria admin padrao |
| `npm run s-stop` | Para Supabase local |
| `npm run s-status` | Mostra status do Supabase local |
| `npm run s-reset` | Reset de banco local |
| `npm run docker:up` | Sobe app/caddy via Docker Compose |
| `npm run docker:down` | Para app/caddy |
| `npm run lan:https:up` | Sobe stack LAN HTTPS completo |
| `npm run lan:mobile:up` | Sobe stack LAN HTTP para celular em `bingo.up` |
| `npm run docker:up:mobile` | Alias do fluxo completo LAN mobile |
| `npm run lan:https:down` | Para stack LAN HTTPS completo |
| `npm run vps:selfhost:up` | Sobe VPS self-host (sem Supabase Cloud) |
| `npm run vps:selfhost:down` | Para VPS self-host |

## Modo 1: Desenvolvimento Local (PC)

### Subir tudo para desenvolvimento

```bash
npm run s-start
npm run dev:full
```

Fluxo:

1. Supabase local sobe via CLI
2. `.env.local` e gerado com URL/chave local
3. admin padrao e provisionado
4. app fica disponivel no Vite

Admin padrao local:

- email: `admin@bingo.local`
- senha: `Admin123456!`

Para parar:

```bash
npm run s-stop
```

## Modo 2: LAN com HTTPS (PC + Celular)

Esse e o modo recomendado para camera/microfone e testes em outros dispositivos da rede.

### Subir stack LAN HTTPS

```bash
npm run lan:https:up
```

Esse comando faz:

1. `supabase start`
2. gera `.env.production` com:
   - `VITE_SUPABASE_URL=https://supabase.lan`
   - `VITE_LIVE_SERVER_URL=https://bingo.lan`
3. sobe `app_bingo` + `caddy_lan`

### DNS local obrigatorio

Voce precisa mapear os dominios para o IP do servidor LAN (exemplo `192.168.1.218`):

- `bingo.lan` -> `192.168.1.218`
- `supabase.lan` -> `192.168.1.218`

Preferencia:

1. configurar no roteador (DNS local)
2. se nao puder, configurar hosts por dispositivo

### Certificado HTTPS interno (obrigatorio)

Depois do primeiro `lan:https:up`, o certificado raiz do Caddy fica em:

`infra/caddy/data/caddy/pki/authorities/local/root.crt`

Instale como autoridade confiavel em cada dispositivo cliente.

#### Windows

ABRA O PowerShell EM MODO ADMISTRADOR DODE O COMANDO ABAIXO


Mapear domínio:

```powershell
Add-Content -Path "C:\Windows\System32\drivers\etc\hosts" -Value "192.168.1.218 bingo.up"
```

Confiar no HTTPS

```powershell
Import-Certificate -FilePath "C:\caminho\do\projeto\infra\caddy\data\caddy\pki\authorities\local\root.crt" -CertStoreLocation "Cert:\LocalMachine\Root"
```

#### Android

1. copiar `root.crt` para o celular (ou `root.pem`)
2. Configuracoes -> buscar por `certificado`
3. instalar como Certificado CA do usuario

Observacao:

- mesmo com certificado instalado, o celular ainda precisa resolver `bingo.lan` e `supabase.lan` para o IP da maquina

### Parar stack LAN HTTPS

```bash
npm run lan:https:down
```

## Modo 2B: LAN para celular sem live

Se o celular' nao vai transmitir live, voce nao precisa depender de HTTPS interno e certificado CA no aparelho.

### Subir stack LAN mobile

```bash
npm run lan:mobile:up
```

Esse comando faz:

1. `supabase start`
2. gera `.env.local` para o frontend local
3. executa o bootstrap do admin padrao
4. gera `.env.production` com `VITE_SUPABASE_URL=http://bingo.up/supabase` e `VITE_LIVE_SERVER_URL` vazio
5. sobe `app_bingo` + `caddy_lan`
6. publica a app em `http://bingo.up`

Alias equivalente:

```bash
npm run docker:up:mobile
```

### DNS local para bingo.up

Para `bingo.up` abrir no celular, o roteador ou DNS interno da rede precisa apontar:

- `bingo.up` -> `192.168.1.218`

Sem isso, nenhum ajuste no container vai fazer o nome abrir no celular. O container responde ao host; quem resolve o nome e o DNS da rede.

No modo mobile atual, o frontend usa `bingo.up/supabase` como proxy para o Supabase. Isso evita depender de um segundo dominio separado no aparelho.

### O que roda no host e o que roda na imagem

`npm run lan:mobile:up` roda no host e orquestra o ambiente completo.

Esse comando e o responsavel por:

- subir o Supabase local
- preparar `.env.local`
- criar/bootstrapar o admin padrao
- preparar `.env.production`
- subir `docker compose`

Ja dentro da imagem da aplicacao, o processo continua sendo somente `node server.js`.

### Quando usar esse modo

- acesso pelo celular dentro da mesma rede
- sem necessidade de camera/microfone da live
- com URL personalizada em vez de `http://192.168.1.218:8082`

### Parar stack LAN mobile

```bash
npm run lan:mobile:down
```

## Modo 3: VPS Self-Host (Sem Supabase Cloud)

### Subir

```bash
npm run vps:selfhost:up
```

Antes, defina a URL publica do Supabase na VPS.

Linux/macOS:

```bash
export VPS_SUPABASE_PUBLIC_URL="https://SEU-DOMINIO-OU-IP:54321"
export VPS_LIVE_SERVER_URL="https://SEU-DOMINIO"
```

Windows PowerShell:

```powershell
$env:VPS_SUPABASE_PUBLIC_URL = "https://SEU-DOMINIO-OU-IP:54321"
$env:VPS_LIVE_SERVER_URL = "https://SEU-DOMINIO"
```

### Parar

```bash
npm run vps:selfhost:down
```

## Modo 4: Hostinger (1 container + Supabase Cloud)

Fluxo recomendado para producao simplificada:

1. usar Supabase Cloud por cliente
2. configurar SMTP no Auth do Supabase
3. preencher `.env.production` com URL/KEY do projeto cloud
4. subir somente app container

Comandos:

```bash
npm run docker:build
npm run docker:up
```

Para parar:

```bash
npm run docker:down
```

## Portas e Endpoints

| Servico | Porta/URL |
| --- | --- |
| App Node (container) | `8082` |
| Caddy HTTP | `80` |
| Caddy HTTPS | `443` |
| Supabase API local | `54321` |
| App LAN HTTPS | `https://bingo.lan` |
| Supabase LAN HTTPS | `https://supabase.lan` |

## Troubleshooting Rapido

### `ERR_CERT_AUTHORITY_INVALID`

Causa:

- certificado raiz do Caddy nao confiado no dispositivo

Correcao:

1. instalar `root.crt` no dispositivo
2. fechar e reabrir navegador
3. conferir DNS para `bingo.lan` e `supabase.lan`

### WebSocket `wss://supabase.lan/...` falhando

Causa comum:

- mesmo problema de certificado ou DNS

Correcao:

1. validar certificado
2. validar resolucao DNS
3. confirmar que `npm run lan:https:up` esta ativo

### Camera/microfone bloqueados

Causa:

- contexto inseguro (HTTP sem certificado confiavel)

Correcao:

1. usar `https://bingo.lan`
2. certificado confiado
3. permissao de camera/mic no navegador

### Container com nome em conflito

```bash
docker rm -f app_bingo caddy_lan
```

Depois:

```bash
npm run lan:https:up
```

## Seguranca e Observacoes de Producao

1. `supabase start` e focado em ambiente local/dev
2. para producao robusta self-host, considerar stack oficial self-host do Supabase
3. proteger segredos e nao versionar `.env.production` com dados reais
4. manter backups de banco e revisar politicas RLS periodicamente

## Documentacao Complementar

- `docs/29_deploy_zero_toque_hostinger.md`
- `docs/30_vps_selfhost_sem_supabase_cloud.md`
- `docs/31_lan_https_com_caddy.md`
- `docs/LIVE_STREAMING.md`

## Licenca

Defina aqui a politica de licenciamento do projeto.
