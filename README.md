# AutoManual AI

Autonomous SaaS user manual video generator powered by Playwright, AI vision/exploration, OpenAI TTS, and Remotion.

## Monorepo Architecture

```text
automanual-ai/
├── apps/
│   ├── web/               # Next.js 14 frontend (Tailwind CSS, React)
│   └── api/               # NestJS Fastify backend (Prisma, BullMQ)
├── packages/
│   ├── shared/            # Shared TypeScript types, enums, interfaces
│   ├── browser-agent/     # Playwright automation engine
│   ├── video-engine/      # Remotion programmatic video compositor
│   └── ai-engine/         # OpenAI integration and prompt pipelines
├── docker-compose.yml     # PostgreSQL 16 & Redis 7 services
├── turbo.json             # Turborepo task pipeline
└── package.json           # Root workspace config
```

## Quickstart

### 1. Install Dependencies

```bash
npm install
```

### 2. Launch Infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
```

### 3. Generate Database Client

```bash
npm run db:generate
```

### 4. Run Development Services

```bash
npm run dev
```

- Web UI: `http://localhost:3000`
- API Server: `http://localhost:4000/api`
- Health Endpoint: `http://localhost:4000/api/health`
