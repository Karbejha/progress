#!/bin/sh
set -e

echo "🌊 Starting General Directorate of Ports Backend..."

# Wait for PostgreSQL to be available
echo "⏳ Synchronizing Prisma database schema..."
npx prisma db push --accept-data-loss

if [ "$SEED_ON_START" = "true" ]; then
  echo "🌱 Seeding initial directorates and users..."
  npx ts-node prisma/seed.ts || echo "Seed completed or already exists."
fi

echo "🚀 Launching Nest.js Application..."
exec node dist/main.js
