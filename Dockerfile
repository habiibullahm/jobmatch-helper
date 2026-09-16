FROM node:20-slim

ENV TZ=Asia/Jakarta \
    NODE_ENV=production

WORKDIR /app

# Dependencies dulu supaya layer ter-cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

# Data persisten (DB + katalog job lokal) di volume
ENV DATA_DIR=/data \
    INDO_JOBS_PATH=/data/jobs-id.json
VOLUME ["/data"]

CMD ["npm", "start"]
