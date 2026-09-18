
## 💻 Tech Stack

- **Frontend**: Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons, Socket.io-client
- **Backend**: NestJS 10, TypeScript, Prisma ORM 5, Passport JWT, Socket.io (WebSockets)
- **Database**: PostgreSQL 16
- **Mobile**: Capacitor 8 (Android Native Platform)
- **Containerization & CI/CD**: Docker Compose, GitHub Actions

---

## 🏗️ Architecture

```text
                  ┌───────────────────────────────┐
                  │      Next.js 16 Frontend      │
                  │   (Port 3000 / Capacitor App) │
                  └───────────────┬───────────────┘
                                  │ REST / WebSockets
                                  ▼
                  ┌───────────────────────────────┐
                  │       NestJS 10 Backend       │
                  │          (Port 4000)          │
                  └───────────────┬───────────────┘
                                  │ Prisma ORM
                                  ▼
                  ┌───────────────────────────────┐
                  │     PostgreSQL 16 Database    │
                  │          (Port 5432)          │
                  └───────────────────────────────┘
```

---

## 📂 Repository Structure

```text
.
├── client/                     # Next.js Frontend & Capacitor Mobile
│   ├── android/                # Native Android project
│   ├── src/
│   │   ├── app/                # App Router pages & layouts
│   │   ├── components/         # React components
│   │   ├── hooks/              # Custom React hooks
│   │   └── lib/                # API client, Socket.io & notifications
│   └── capacitor.config.json   # Capacitor configuration
├── server/                     # NestJS Backend API
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema & relations
│   │   └── seed.ts             # Initial database seed script
│   └── src/
│       ├── auth/               # Authentication & JWT
│       ├── daily-plans/        # Daily plans module
│       ├── daily-summaries/    # Daily summaries module
│       ├── executive-tasks/    # Executive tasks module
│       ├── events/             # WebSocket gateway
│       └── notifications/      # Notifications module
├── docker-compose.yml          # Docker Compose orchestration
├── .env.example                # Sample environment variables
├── ACCOUNTS.md                 # Seed accounts & credentials
├── DEPLOYMENT.md               # Production deployment guide
└── MOBILE_APP_GUIDE.md         # Android APK build guide
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `POSTGRES_DB` | `ports_daily_system` | PostgreSQL Database name |
| `POSTGRES_USER` | `postgres` | PostgreSQL Username |
| `POSTGRES_PASSWORD` | `P@ssw0rd` | PostgreSQL Password |
| `POSTGRES_PORT` | `5432` | PostgreSQL Port |
| `BACKEND_PORT` | `4000` | NestJS API Port |
| `JWT_SECRET` | - | Secret key for JWT tokens |
| `SEED_ON_START` | `true` | Auto-seed database on server start |
| `FRONTEND_PORT` | `3000` | Next.js Web Port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Backend API URL for client & mobile |

---

## 🚀 Quick Start

### 1. Run with Docker Compose (Recommended)

```bash
# Build and run all services
docker compose up -d --build

# View logs
docker compose logs -f

# Stop services
docker compose down
```

- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:4000`
- **Database**: `localhost:5432`

---

### 2. Manual Local Development

#### Prerequisites
- Node.js 20+
- PostgreSQL 16+ running locally

#### Backend Setup (`/server`)
```bash
cd server
npm install

# Prisma Schema Sync & Seed
npx prisma generate
npx prisma db push
npm run prisma:seed

# Start Dev Server
npm run dev
```

#### Frontend Setup (`/client`)
```bash
cd client
npm install

# Start Dev Server
npm run dev
```

---

## 🛠️ Useful Commands & Scripts

### Server (`/server`)
```bash
npm run dev             # Start in watch mode
npm run build           # Build TypeScript to dist/
npm run start:prod      # Run production build
npx prisma studio       # Open Prisma Studio GUI
npm run prisma:seed     # Re-seed database
```

### Client (`/client`)
```bash
npm run dev             # Start Next.js dev server
npm run build           # Build production standalone bundle
npm run lint            # Run ESLint
npx cap sync android    # Sync web assets to Android project
```

### Database Backup & Restore
```bash
# Export Backup
docker exec -t ports-postgres pg_dump -U postgres ports_daily_system > backup.sql

# Restore Backup
cat backup.sql | docker exec -i ports-postgres psql -U postgres -d ports_daily_system
```

---

## 📖 Additional Technical References

- **Credentials & Roles**: [ACCOUNTS.md](file:///c:/workspace/progress/ACCOUNTS.md)
- **Deployment & CI/CD**: [DEPLOYMENT.md](file:///c:/workspace/progress/DEPLOYMENT.md)
- **Android APK Build**: [MOBILE_APP_GUIDE.md](file:///c:/workspace/progress/MOBILE_APP_GUIDE.md)
