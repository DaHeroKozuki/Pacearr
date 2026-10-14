FROM node:24-alpine
RUN apk add --no-cache ffmpeg
LABEL org.opencontainers.image.source="https://github.com/DaHeroKozuki/Pacearr"
LABEL org.opencontainers.image.version="1.1.1"
WORKDIR /app
COPY server.mjs beta-readonly.mjs beta-policy.mjs import-engine.mjs official-releases.mjs download-actions.mjs torrent-metadata.mjs ./
COPY web ./web
RUN mkdir -p /data/state && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
