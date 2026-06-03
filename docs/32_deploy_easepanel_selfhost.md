# Deploy EasePanel — Supabase Self-Host

Tudo rodando na sua VPS sem Supabase Cloud. Sem limite de egress.

## Pré-requisitos

- VPS com mínimo **4 GB RAM** (recomendado 4 GB+)
- Docker e Docker Compose instalados
- EasePanel instalado
- Domínio apontando para o IP da VPS (ou use IP diretamente)
- Dois subdomínios configurados no DNS:
  - `bingo.seudominio.com` → app bingo (porta 8082)
  - `supabase.seudominio.com` → Supabase Kong (porta 8000)

---

## Parte 1 — Gerar chaves JWT

**OBRIGATÓRIO:** Gere chaves JWT únicas para produção. Não use os defaults de demo.

### Passo 1.1 — Gerar JWT_SECRET

```bash
openssl rand -base64 32
# Exemplo: xK8mN2pQ9rL4vW7jY1tA6dF3hG5bE0cI
```

### Passo 1.2 — Gerar ANON_KEY e SERVICE_ROLE_KEY

Acesse: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys

OU use o script abaixo (Node.js):

```bash
node -e "
const jwt = require('jsonwebtoken');
const secret = 'SEU_JWT_SECRET_AQUI';
const now = Math.floor(Date.now() / 1000);
const exp = now + (10 * 365 * 24 * 60 * 60); // 10 anos

const anon = jwt.sign({ role: 'anon', iss: 'supabase', iat: now, exp }, secret, { algorithm: 'HS256' });
const service = jwt.sign({ role: 'service_role', iss: 'supabase', iat: now, exp }, secret, { algorithm: 'HS256' });

console.log('ANON_KEY=' + anon);
console.log('SERVICE_ROLE_KEY=' + service);
"
```

---

## Parte 2 — Configurar EasePanel

### Passo 2.1 — Criar serviço no EasePanel

1. No EasePanel: **Create App > Docker Compose**
2. Aponte para o repositório Git do projeto
3. Arquivo Compose: `docker-compose.easepanel.yml`

### Passo 2.2 — Configurar variáveis de ambiente

No EasePanel, na aba **Environment Variables** do serviço, adicione TODAS as variáveis do arquivo `.env.easepanel.example`:

| Variável | Valor |
|----------|-------|
| `POSTGRES_PASSWORD` | Senha forte gerada |
| `JWT_SECRET` | JWT secret gerado no Passo 1.1 |
| `ANON_KEY` | Gerado no Passo 1.2 |
| `SERVICE_ROLE_KEY` | Gerado no Passo 1.2 |
| `SITE_URL` | `https://bingo.seudominio.com` |
| `API_EXTERNAL_URL` | `https://supabase.seudominio.com` |
| `VITE_SUPABASE_URL` | `https://supabase.seudominio.com` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Mesmo que `ANON_KEY` |
| `VITE_LIVE_SERVER_URL` | `https://bingo.seudominio.com` |
| `SMTP_HOST` | Seu servidor SMTP |
| `SMTP_PORT` | 587 |
| `SMTP_USER` | Usuário SMTP |
| `SMTP_PASS` | Senha SMTP |
| `SMTP_ADMIN_EMAIL` | Email do admin |

### Passo 2.3 — Configurar domínios no EasePanel

Configure dois domínios no EasePanel:

| Domínio | Porta interna |
|---------|--------------|
| `bingo.seudominio.com` | 8082 |
| `supabase.seudominio.com` | 8000 |

---

## Parte 3 — Subir pela primeira vez

### Passo 3.1 — Build e start

No EasePanel, clique **Deploy**. O build do app bingo leva ~3-5 minutos.

Ordem de inicialização (automática):
1. `db` — PostgreSQL inicia e cria schema
2. `kong` — Gateway aguarda db
3. `auth`, `rest`, `realtime`, `storage`, `meta` — iniciam após db
4. `app_bingo` — inicia após kong

### Passo 3.2 — Criar admin inicial

Após todos containers UP, rode via EasePanel Console (ou SSH):

```bash
# Dentro do container app_bingo ou direto na VPS
SUPABASE_URL=http://kong:8000 \
SUPABASE_SERVICE_ROLE_KEY=SEU_SERVICE_ROLE_KEY \
LOCAL_ADMIN_EMAIL=admin@seudominio.com \
LOCAL_ADMIN_PASSWORD=SenhaAdmin123! \
node scripts/bootstrap-local-admin.mjs
```

### Passo 3.3 — Aplicar migrations

```bash
# Na VPS com supabase CLI instalado:
supabase db push --db-url postgresql://postgres:POSTGRES_PASSWORD@localhost:5432/postgres
```

Ou via EasePanel Console no container `supabase_db`:
```bash
# Copiar cada migration manualmente e executar
psql -U postgres -d postgres -f /migration.sql
```

---

## Parte 4 — Verificar funcionamento

1. Acesse `https://bingo.seudominio.com` — app deve carregar
2. Acesse `https://supabase.seudominio.com/rest/v1/` — deve retornar JSON
3. Tente login — email de confirmação deve chegar (se SMTP configurado)

---

## Parte 5 — Atualizações futuras

Para atualizar o app após mudanças no código:

```bash
# No EasePanel, clique "Redeploy" ou "Build"
# Isso rebuilda a imagem com os novos build args e reinicia o container
```

Para migrar banco após mudanças de schema:
```bash
# Crie migration em supabase/migrations/YYYYMMDD_descricao.sql
# Aplique via supabase CLI na VPS
```

---

## Troubleshooting

### App não conecta no Supabase

- Verifique `VITE_SUPABASE_URL` — deve ser URL pública (`https://supabase.seudominio.com`)
- **Não use URL interna** (`http://kong:8000`) — o browser não acessa rede Docker
- Confirme que domínio `supabase.seudominio.com` aponta para porta 8000

### 402 / Auth error

- `ANON_KEY` no `.env` deve ser **exatamente igual** ao key no `kong.yml`
- Confirme que `JWT_SECRET` usado para gerar as keys é o mesmo configurado em `auth` e `rest`

### Realtime não funciona

- Verifique healthcheck do container `realtime`: `docker logs supabase_realtime`
- `ANON_KEY` no header deve ser válido

### Email não chega

- Teste SMTP com: `nc -zv SMTP_HOST SMTP_PORT`
- Considere usar Resend (resend.com) — free tier 3000 emails/mês, fácil configurar

### RAM insuficiente

- Supabase mínimo usa ~1.5 GB
- App bingo usa ~200 MB
- Total: ~1.8-2.2 GB em idle. Com 4 GB está ok.

---

## Serviços OPCIONAIS (não inclusos por padrão)

Para adicionar depois se precisar:

- **Studio** (`supabase/studio`) — interface admin visual do banco (~300 MB RAM)
- **Imgproxy** — transformação de imagens em storage
- **Analytics** — logs e analytics

Adicione ao `docker-compose.easepanel.yml` se necessário.
