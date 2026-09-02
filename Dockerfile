FROM node:lts-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm i
COPY src /app/src
COPY tsconfig.json .
RUN npm run build
RUN npm prune --omit=dev


FROM node:lts-alpine AS runner
LABEL org.opencontainers.image.title="Pacearr"
LABEL org.opencontainers.image.source="https://github.com/DaHeroKozuki/Pacearr"
LABEL org.opencontainers.image.description="Pacearr - self-hosted One Pace library management with resilient automation, recovery, and media-server integration."
LABEL org.opencontainers.image.version="0.1.0-alpha"

WORKDIR /app
COPY package.json ./
COPY posters ./posters
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN touch .env

EXPOSE 3000
CMD ["npm", "start"]
