FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install --no-fund --no-audit

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
