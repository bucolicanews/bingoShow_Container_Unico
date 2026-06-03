FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install --no-fund --no-audit

# Build-time vars: Vite bakes these into the JS bundle at build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_LIVE_SERVER_URL
ARG VITE_REALTIME_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_LIVE_SERVER_URL=$VITE_LIVE_SERVER_URL
ENV VITE_REALTIME_URL=$VITE_REALTIME_URL

COPY . .
RUN npm run build
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
