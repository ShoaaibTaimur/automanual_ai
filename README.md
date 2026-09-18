# AutoManual AI

Autonomous SaaS user manual and video tutorial generator powered by Playwright, multi-model AI exploration (Groq, OpenAI, Anthropic, Gemini), Edge/OpenAI TTS narration, and Remotion video rendering.

Given any web application URL (and optional credentials), AutoManual AI autonomously discovers all pages, generates a structured user manual plan, records high-resolution browser walkthroughs with visual mouse cues, narrates each feature with synchronized AI voiceover, and renders an animated 1080p video manual.

---

## 🏗 System Architecture & End-to-End Pipeline

```mermaid
flowchart TD
    A[User Inputs Target Web App URL & Credentials] --> B[Phase 1: Autonomous Discovery]
    B -->|Playwright Crawl + Screenshots| C[Phase 2: AI Feature Synthesis & Plan Generation]
    C -->|LLM Multi-Provider Engine| D[Phase 3: Human Approval Gate]
    D -->|User Approves Plan in Dashboard| E[Phase 4: Studio Browser Execution & Recording]
    E -->|Playwright 1080p + Event Logger| F[Phase 5: AI Narration & TTS Audio Generation]
    F -->|Synchronized Audio + Subtitles| G[Phase 6: Remotion Video Composition & Rendering]
    G --> H[Final Tutorial Video + Interactive Manual]
```

1. **Discovery**: Authenticates into target SaaS, crawls internal SPA navigation, sidebar buttons, and tabs; saves session state and captures screenshots.
2. **Plan Generation**: Synthesizes features into ordered workflows (e.g., login, dashboard overview, sub-modules) with granular steps (`navigate`, `click`, `input`, `scroll`).
3. **Approval Gate**: Human reviews workflow plan in Next.js web dashboard.
4. **Recording**: Launches Playwright Chromium in 1920x1080, records video while executing cursor movements, purple target glows, inputs, and clicks; logs coordinate and timestamp event traces.
5. **Narration**: Generates detailed, professional scripts explaining what each screen does, synthesizing synchronized voice audio via Edge-TTS / OpenAI TTS.
6. **Remotion Render**: Overlays animated cursor ripples, glowing element bounding boxes, zoom effects, subtitles, and narration onto the screen recording to produce an MP4 manual.

---

## ⚡ Quickstart

### Prerequisites
- Node.js 18+ & npm 9+
- Docker & Docker Compose (for PostgreSQL 16 & Redis 7)
- Google Chrome or Chromium (managed by Playwright)

### One-Command Startup
```bash
# Make launch scripts executable (if needed)
chmod +x start.sh stop.sh

# Start PostgreSQL, Redis, compile all workspaces, and launch API + Web servers
./start.sh
```

To stop all background services:
```bash
./stop.sh
```

### Manual Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Start Docker services (Postgres & Redis)**:
   ```bash
   docker compose up -d
   ```

3. **Initialize database with Prisma**:
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Run dev servers**:
   ```bash
   npm run dev
   ```

- **Web Dashboard**: [http://localhost:3000](http://localhost:3000)
- **API Server**: [http://localhost:4001/api](http://localhost:4001/api)
- **API Health**: [http://localhost:4001/api/health](http://localhost:4001/api/health)

---

## 📂 Repository File Directory Guide

### `apps/web/` — Next.js 14 Frontend Dashboard
The user-facing control center built with React 18, Tailwind CSS, Lucide icons, and Server/Client Components.

- `app/layout.tsx`: Root HTML layout with dark-mode theme provider and navigation header.
- `app/globals.css`: Global styles, custom scrollbar utilities, glowing highlights, and animations.
- `app/page.tsx`: Landing page redirecting to `/projects`.
- `app/projects/page.tsx`: Project dashboard listing all projects, statuses, creation modal, and instant project deletion.
- `app/projects/[id]/page.tsx`: Project detail view showing real-time stage progress bars (Discovery → Plan → Recording → Narration → Voice → Rendering), workflow plan approval/rejection editor, stage timing metrics, error badges with retry actions, and final video player.
- `lib/utils.ts`: Utility helpers for className merging (`clsx` + `tailwind-merge`).
- `tailwind.config.ts` & `postcss.config.mjs`: Styling tokens and PostCSS plugins.

---

### `apps/api/` — NestJS & BullMQ Backend Service
The core orchestration server managing asynchronous jobs, database persistence, and lifecycle transitions.

- `src/main.ts`: NestJS bootstrap file configuring CORS, JSON body parsers, validation pipes, and port binding (`:4001`).
- `src/app.module.ts`: Root module wiring configuration, Prisma, Redis/BullMQ, and feature modules.
- `prisma/schema.prisma`: Database schema defining `Project`, `Discovery`, `Plan`, `Workflow`, `Recording`, `NarrationSegment`, `VideoRender`, and the `ProjectStatus` lifecycle enum.
- `src/modules/projects/`:
  - `projects.controller.ts`: REST endpoints (`POST /api/projects`, `GET /api/projects`, `DELETE /api/projects/:id`, `POST /api/projects/:id/retry`, `GET /api/projects/:id/timings`).
  - `projects.service.ts`: Project creation with credential encryption, retry triggers, status rollbacks, and storage cleanup.
- `src/modules/discovery/`:
  - `discovery.controller.ts`: Endpoints to inspect discovered application routes and manual trigger.
  - `discovery.service.ts`: Orchestrates headless crawler, saves authenticated cookies (`session.json`), and feeds raw section metadata to AI feature synthesis.
- `src/modules/plans/`:
  - `plans.controller.ts`: Endpoints for plan generation, retrieval, and approval (`POST /api/projects/:id/plan/approve`).
  - `plans.service.ts`: Persists exploration plans and workflows into Prisma; triggers execution queue upon user approval.
- `src/modules/jobs/`:
  - `jobs.service.ts`: BullMQ queue processor running multi-stage execution (Recording → Narration → TTS Voice → Remotion Render), cancellation handling, and stage timing metrics.
- `src/modules/browser/`:
  - `browser.controller.ts` & `browser.service.ts`: Interactive test helpers for validating authentication against target URLs.
- `src/modules/health/`:
  - `health.controller.ts`: Liveness and readiness health checks.
- `src/modules/prisma/`:
  - `prisma.service.ts`: PostgreSQL connection lifecycle client.

---

### `packages/shared/` — Shared Types & Interfaces
Cross-package TypeScript contracts used by API, web, and workers to prevent type drift.

- `src/index.ts`:
  - `ProjectStatus`: Lifecycle state machine (`CREATED` → `DISCOVERING` → `AWAITING_APPROVAL` → `RECORDING` → `GENERATING_NARRATION` → `GENERATING_VOICE` → `RENDERING_VIDEO` → `COMPLETED`).
  - `WorkflowStep`, `Workflow`, `ExplorationPlan`: Schema for AI-generated actions.
  - `RecordedEvent`: Coordinate traces (`x`, `y`, `width`, `height`, `type`, `url`, `timestamp`).
  - `NarrationSegment`, `RenderProgress`: Media synchronization structures.

---

### `packages/browser-agent/` — Playwright Automation Engine
Autonomous browser crawling, live authentication handling, and recorded plan execution.

- `src/browser-runner.ts`: Wrapper around Playwright Chromium managing window sizing (1920x1080), headless/headed mode, anti-detection flags, video recording directory, and session persistence.
- `src/auth-detector.ts`: Heuristic and regex engine detecting login forms, email/username inputs, password fields, and submit buttons.
- `src/login-manager.ts`: Handles automated sign-in during discovery, retries submits, handles redirects, and exports authenticated cookies/localStorage to `session.json`.
- `src/discovery-engine.ts`: Intelligent crawler exploring SPA dashboards, extracting unique sidebar links and action buttons while skipping external marketing, policy, or legal pages.
- `src/workflow-executor.ts`: The recording engine. Executes approved exploration steps:
  - Records live authentication on camera with mouse navigation and purple glowing element focus.
  - Keeps browser strictly locked to application dashboard origin.
  - Moves cursor with smooth easing, highlights clicked targets with purple rings (`#6366f1`), fills inputs with reactive event dispatching (`input`, `change`), and handles vertical centering.
  - Emits JSON event stream with timestamped coordinates for Remotion compositor.
- `src/safety-guard.ts`: Protective firewall blocking destructive actions (e.g. "Delete Account", "Disconnect", "Drop Database") during autonomous execution.
- `src/event-logger.ts`: Collects and timestamps browser interaction events for video timeline synchronization.
- `src/screenshot-capture.ts`: Captures full-page and element screenshots during discovery for AI vision parsing.

---

### `packages/ai-engine/` — LLM Intelligence & Speech Engine
Multi-model prompt pipelines with automatic failover and text-to-speech generation.

- `src/llm-provider.ts`: Resilient LLM client supporting Groq (primary high-speed inference), OpenAI (`gpt-4o`), Anthropic Claude, and Google Gemini with automatic failover if rate limits or errors occur.
- `src/feature-synthesizer.ts`: Analyzes discovered pages, titles, buttons, and DOM text to construct clean architectural feature descriptions.
- `src/plan-generator.ts`: Prompts LLM to produce structured `ExplorationPlan` with logical ordering, step actions, and priorities.
- `src/narration-generator.ts`: Writes professional, engaging, and pedagogical voiceover scripts for every workflow and screen action.
- `src/voice-generator.ts`: Audio generation client using Microsoft Edge TTS (free, natural neural voices) with fallback to OpenAI Audio API, generating `.mp3` audio files and segment durations.
- `src/timeline-builder.ts`: Synchronizes browser recording events with voice segment durations to build Remotion timeline cues.

---

### `packages/video-engine/` — Remotion Video Compositor
Programmatic video rendering engine that turns raw browser recordings into polished tutorial manuals.

- `src/renderer.ts`: Orchestrates Remotion CLI/Bundler to composite video tracks, audio narration, subtitles, visual effects, and render the final MP4.
- `src/index-remotion.ts`: Entry point registering Remotion compositions.
- `src/compositions/`:
  - `Root.tsx`: Declares compositions, resolution (1920x1080), framerate (30fps), and input schema.
  - `TutorialComposition.tsx`: Main video composition synchronizing screen recording, background music, voiceover audio track, and overlays.
  - `BrowserRecording.tsx`: Offthread video player component rendering raw Chromium `.webm` recording.
  - `AnimatedCursor.tsx`: Smoothly moves custom SVG cursor to logged `(x, y)` click coordinates.
  - `ElementHighlight.tsx`: Draws animated glowing purple bounding box rings around targets being demonstrated.
  - `ClickRipple.tsx`: Produces expanding click ripples at action coordinates.
  - `ZoomEffect.tsx`: Applies smooth camera zoom onto specific interface elements during important operations.
  - `CaptionOverlay.tsx`: Displays clean, synchronized subtitle cards for narration.

---

## 🛠 Configuration (`.env`)

Configure the following environment variables in `apps/api/.env`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/automanual?schema=public"

# Redis Queue
REDIS_URL="redis://localhost:6379"

# AI Inference Keys (Provide at least one)
GROQ_API_KEY="gsk_..."
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="..."

# Security & Storage
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
STORAGE_PATH="./storage"

# Ports
PORT=4001
NEXT_PUBLIC_API_URL="http://localhost:4001"

# Playwright Options (Set false to watch browser execute in real time on desktop)
PLAYWRIGHT_HEADLESS=false
```

---

## 🤝 Contribution Guidelines

1. **Monorepo Workspaces**: When running workspace-specific commands:
   ```bash
   npm run build --workspace=@automanual/browser-agent
   npm run build --workspace=@automanual/api
   ```
2. **Database Migrations**: When changing `schema.prisma`:
   ```bash
   npx prisma db push --schema=apps/api/prisma/schema.prisma
   npx prisma generate --schema=apps/api/prisma/schema.prisma
   ```
3. **Safe Automation**: Always ensure any new browser actions are vetted through `SafetyGuard` to prevent destructive operations on live test applications.
