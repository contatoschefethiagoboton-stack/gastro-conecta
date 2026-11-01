FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Variáveis NEXT_PUBLIC_* são embutidas no build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_TILE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_TILE_URL=$NEXT_PUBLIC_TILE_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
