# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./
COPY .env.defaults ./

RUN npm ci
RUN npm i typescript

COPY src ./src

RUN npm run build \
    && npm prune --omit=dev

# Ensure logs directory exists and is writable
RUN mkdir -p /usr/src/app/logs \
    && chown -R node:node /usr/src/app/logs || true

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server.js"]
