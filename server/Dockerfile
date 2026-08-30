# Multi-stage Dockerfile for Nest.js Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --legacy-peer-deps

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and build
COPY . .
RUN npm run build

# Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install curl for healthchecks
RUN apk add --no-cache curl

COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies + ts-node for seed execution
RUN npm ci --only=production --legacy-peer-deps && \
    npm install -g ts-node typescript && \
    npx prisma generate

# Copy built code from builder
COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
