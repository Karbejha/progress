#!/bin/sh
set -e

echo "🌊 Starting General Directorate of Ports Backend..."

echo "⏳ Synchronizing Prisma database schema..."
npx prisma db push

if [ "${SEED_ON_START:-true}" = "true" ]; then
    echo "🌱 Seeding initial directorates and users..."

    if [ -f "./dist/prisma/seed.js" ]; then
        echo "📦 Using compiled seed: dist/prisma/seed.js"
        node ./dist/prisma/seed.js
    else
        echo "❌ Compiled seed file was not found."
        echo "📂 Available compiled files:"
        find ./dist -maxdepth 4 -type f -print
        exit 1
    fi

    echo "✅ Seed completed."
else
    echo "⏭️ Database seed skipped."
fi

echo "🚀 Launching Nest.js Application..."

if [ -f "./dist/src/main.js" ]; then
    echo "📦 Entry point: dist/src/main.js"
    exec node ./dist/src/main.js
elif [ -f "./dist/main.js" ]; then
    echo "📦 Entry point: dist/main.js"
    exec node ./dist/main.js
else
    echo "❌ Nest.js entry point not found."
    echo "📂 Available compiled files:"
    find ./dist -maxdepth 4 -type f -print
    exit 1
fi