# Multi-stage Dockerfile for Nest.js Backend

# =========================
# 1. Builder Stage
# =========================
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --legacy-peer-deps

RUN npx prisma generate

COPY . .

RUN npm run build


# =========================
# 2. Production Runner
# =========================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache curl openssl

COPY package*.json ./
COPY prisma ./prisma/

# IMPORTANT:
# Install project dependencies, including the project's
# own ts-node/typescript versions used by the seed.
RUN npm ci --legacy-peer-deps && \
    npx prisma generate

COPY --from=builder /app/dist ./dist

COPY docker-entrypoint.sh ./

RUN sed -i 's/\r$//' docker-entrypoint.sh && \
    chmod +x docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]