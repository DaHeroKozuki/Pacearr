FROM node:lts-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm i
COPY src /app/src
COPY tsconfig.json .
RUN npm run build
RUN npm prune --omit=dev


FROM node:lts-alpine AS runner
LABEL org.opencontainers.image.source="https://github.com/DaHeroKozuki/OnePacerr-beta"
LABEL org.opencontainers.image.description="OnePacerr beta fork with Plex stability improvements, Docker compatibility fixes, and Linux/Windows path handling."
LABEL org.opencontainers.image.version="v1.7.19-beta"

WORKDIR /app
COPY package.json ./
COPY posters ./posters
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN touch .env

EXPOSE 3000
CMD ["npm", "start"]
