FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src/ ./src/
COPY views/ ./views/
COPY public/ ./public/

RUN mkdir -p /app/logs && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
