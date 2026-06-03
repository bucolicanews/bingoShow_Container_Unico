FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install --no-fund --no-audit

# Build-time vars via ARG: sobrescrevem .env files quando passados
# VITE_REALTIME_URL NÃO usa ARG — vem do .env.easepanel para não sobrescrever com vazio
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_LIVE_SERVER_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_LIVE_SERVER_URL=$VITE_LIVE_SERVER_URL

COPY . .
# BUILD_MODE=easepanel lê .env.easepanel (tem VITE_REALTIME_URL com URL direta do Realtime)
# BUILD_MODE vazio usa .env.production
ARG BUILD_MODE
RUN if [ "$BUILD_MODE" = "easepanel" ]; then npm run build:easepanel; else npm run build; fi
RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8082

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js

EXPOSE 8082
CMD ["node", "server.js"]
