# DevTrack

Issue and project tracking for small software teams: a simplified Jira with a Kanban board, role-based permissions, comments with @mentions, real-time updates, notifications and project analytics.

Built as a full-stack TypeScript monorepo: **Next.js** frontend and **NestJS** API, backed by **PostgreSQL** (via Prisma) and **Redis** (WebSocket fan-out, background jobs, caching).

**Live demo:** _add your link here after deploying_ · log in with `marco@devtrack.dev` / `Password123` (the free API sleeps when idle, so the first load can take up to a minute).

![Kanban board](docs/screenshots/board.png)

- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Roles & permissions](#roles--permissions)
- [Local development (without Docker)](#local-development-without-docker)
- [Environment variables](#environment-variables)
- [Database: migrations & seed](#database-migrations--seed)
- [Testing & coverage](#testing--coverage)
- [API documentation](#api-documentation)
- [CI/CD](#cicd)
- [Deploy (free tier)](#deploy-free-tier)
- [Screenshots](#screenshots)
- [Design decisions](#design-decisions)
- [Known limitations](#known-limitations)
- [Project structure](#project-structure)

---

## Quick start

Requires Docker with Compose v2.

```bash
docker compose up --build
```

| What | URL |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:4000/api |
| API docs (Swagger) | http://localhost:4000/api/docs |
| Health check | http://localhost:4000/api/health |

On first start the API applies migrations and seeds demo data (only into an empty database, so restarts never wipe your changes). `docker compose down -v` removes the data volume for a clean slate.

If ports 5432 or 6379 are taken on your machine, copy `.env.example` to `.env` and change `POSTGRES_PORT` / `REDIS_PORT`.

## Demo accounts

All passwords are **`Password123`**. The login page also lists these for one-click sign-in.

| Email | Role | Good for trying |
| --- | --- | --- |
| `admin@devtrack.dev` | Admin | Everything, including user management at **Users** |
| `priya@devtrack.dev` | Project manager | Owns *Web Storefront* and *Mobile App*; members, labels, any issue |
| `marco@devtrack.dev` | Developer | Has assigned work, an overdue issue and notifications |
| `sara@devtrack.dev` | Developer | Second developer, useful for testing real-time updates side by side |
| `dev@devtrack.dev` | Developer | Daniel Okafor, another team member |
| `viewer@devtrack.dev` | Viewer | Read-only: locked board cards, no create or comment |

Seed data: 6 users, 3 projects (WEB with 12 issues, MOB with 6, and OPS: on hold, visible only to its members Admin and Marco), plus comments, activity history and notifications.

**Try real-time updates:** open the WEB board as Priya in one browser and as Marco in a private window. Create an issue assigned to Marco: it appears on his board without a refresh, and he gets a toast and an unread badge.

## Features

Everything below is implemented and covered by automated tests (see [Testing](#testing--coverage)).

**Authentication & accounts**
- Register, log in, log out, view and edit profile, change password.
- Passwords hashed with bcrypt (cost 12). Login returns the same error for unknown email and wrong password, and does the same amount of hashing work either way, so accounts can't be discovered by timing.
- Short-lived JWT access token (15 min, kept only in memory) plus a rotating refresh token in an `httpOnly` cookie, stored hashed in the database.
- Refresh-token reuse detection: a rotated token is honoured for 30 s (parallel tabs, interrupted page loads). Reuse after that is treated as theft and revokes all of the user's sessions.
- Changing the password or being deactivated signs the user out everywhere.
- Rate limiting: 300 requests/min per client overall, and 10/min on login, register and change-password.

**Projects**
- Create, edit (name, description, status: active / on hold / archived), delete. Keys such as `WEB` are unique and permanent and prefix issue keys (`WEB-12`).
- Members: add (the added user is notified) and remove (their issues in that project become unassigned). Project labels with colours.
- Non-members get **404** for a project, so its existence isn't leaked.

**Issues**
- Title, description, type (bug / feature / task / improvement), status (to do / in progress / in review / done), priority (low → critical), assignee, reporter, due date, labels.
- Sequential per-project numbering, allocated atomically, so concurrent creates never collide.
- **Kanban board** with drag and drop (mouse, touch with press-and-hold, keyboard). Moves are optimistic, persisted through the API and rolled back with a message if refused. Cards the user may not move show a padlock.
- **List view** with backend search (title, description, or key like `WEB-3`), multi-value filters (status, priority, type, assignee incl. "me" / "unassigned", label), sorting (newest, updated, priority, due date with empty dates last, title) and pagination. Filters live in the URL, so views are shareable.
- **Activity timeline**: one entry per changed field (e.g. "moved it from In progress to In review"). Saving without changes records nothing.

**Collaboration**
- Comments: create, edit (author only), delete (author, or a manager moderating).
- `@username` mentions notify project members (and only members).
- **Real-time updates** over WebSockets: issue created/updated/deleted and comment events for the project you're viewing, plus personal notifications, with no page refresh. Socket connections are authenticated, and project rooms check membership.

**Notifications**
- Triggered when you're assigned, mentioned, an issue assigned to you is updated, someone comments on an issue you're involved in (reporter, assignee or earlier commenter), or you're added to a project.
- Created by a **BullMQ background worker** via Redis (retries with backoff), so API requests don't wait on fan-out. Never notifies you about your own actions; one notification per person per event.
- Unread badge, toasts, list with an unread filter, mark one or all as read.

**Analytics**
- Per-project: totals, overdue count, issues by status (donut), open issues by priority, issues by type, created vs completed over 14 days, workload by assignee, recent activity feed. Cached in Redis for 60 s and invalidated on every change.
- Personal dashboard: assigned open work, overdue, due within 7 days, "up next" list ordered by urgency.

**Administration**
- Admins change user roles and deactivate or reactivate accounts (not their own).

**UI quality**
- Responsive from 390 px phones upward (drawer navigation, board columns snap-scroll on mobile).
- Loading skeletons, empty states, error states with retry, toasts, confirmation dialogs for destructive actions.
- Client-side validation mirroring the API rules.
- Accessible markup: labelled controls, keyboard drag and drop, native `<dialog>` focus handling, reduced-motion support.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, TanStack Query 5, dnd-kit, Recharts, React Hook Form + Zod, Socket.IO client, Sonner |
| Backend | NestJS 11, TypeScript, Prisma 6 (Rust-free client with the `pg` driver adapter), Passport JWT, class-validator, Swagger/OpenAPI, Socket.IO, BullMQ, `@nestjs/throttler`, Helmet |
| Data | PostgreSQL 16 (with `pg_trgm` indexes for search), Redis 7 |
| Testing | Jest, Supertest, socket.io-client (e2e against real Postgres and Redis) |
| Tooling | ESLint, Prettier, Docker multi-stage builds, Docker Compose, GitHub Actions |

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js app<br/>React Query cache"]
  end

  subgraph API["NestJS API :4000"]
    direction TB
    Guards["Guards<br/>JWT → Roles → Rate limit"]
    Modules["Modules<br/>auth · users · projects · issues<br/>comments · notifications · analytics"]
    Policy["Access policy<br/>(pure functions)"]
    GW["Socket.IO gateway<br/>rooms: user:id, project:id"]
    Worker["BullMQ worker<br/>notification fan-out"]
    Guards --> Modules --> Policy
  end

  PG[("PostgreSQL<br/>Prisma")]
  RD[("Redis")]

  UI -- "REST /api (JSON)" --> Guards
  UI <-- "WebSocket events" --> GW
  Modules --> PG
  Modules -- "enqueue job" --> RD
  RD -- "job" --> Worker
  Worker --> PG
  Worker -- "notification:new" --> GW
  Modules -- "issue / comment events" --> GW
  Modules <-- "analytics cache" --> RD
  GW <-- "pub/sub adapter" --> RD
```

**How a change flows through the system.** When a developer drags a card to *In review*:
1. The browser moves the card immediately (optimistic update) and sends `PATCH /api/issues/:id/status`.
2. The API authenticates the JWT, loads the project membership and checks the access policy, e.g. a developer may only move issues assigned to or reported by them.
3. It saves the change and an activity entry, and invalidates the project's analytics cache.
4. It broadcasts `issue:updated` to the `project:{id}` room, so other members' boards update live.
5. It enqueues a notification job and returns immediately.
6. The BullMQ worker works out who should be told (here, the assignee, unless they made the change), writes notification rows and emits `notification:new` to each recipient's `user:{id}` room.

**Why Redis is involved three ways.** The Socket.IO Redis adapter lets several API instances share rooms. BullMQ gives retries and keeps notification fan-out off the request path. The analytics cache avoids re-aggregating on every dashboard view. Redis is not the source of truth for anything. If the cache is unavailable, requests still succeed, and `/api/health` reports it as degraded.

**Where the rules live.** All permission rules are pure functions in [`apps/backend/src/access/policy.ts`](apps/backend/src/access/policy.ts) with exhaustive unit tests. Services call them, and the API returns a `permissions` block with projects and issues so the UI can hide controls the user can't use. The API remains the authority.

## Roles & permissions

The global role decides *what* a user may do, and project membership decides *where*. Admins bypass membership.

| | Admin | Project manager | Developer | Viewer |
| --- | --- | --- | --- | --- |
| See a project and its issues | All projects | Member projects | Member projects | Member projects |
| Create projects | ✓ | ✓ | – | – |
| Edit project, manage members & labels | ✓ | ✓ (member) | – | – |
| Delete project | ✓ | ✓ (owner) | – | – |
| Create issues | ✓ | ✓ | ✓ | – |
| Edit / move issues | ✓ | ✓ | Assigned to or reported by them | – |
| Assign issues | Anyone | Any member | Themselves, or unassign themselves | – |
| Delete issues | ✓ | ✓ | – | – |
| Comment | ✓ | ✓ | ✓ | – |
| Edit comments | Own | Own | Own | – |
| Delete comments | ✓ | ✓ (moderation) | Own | – |
| Manage users & roles | ✓ | – | – | – |

New sign-ups start as **Developer**, and only an admin can change roles. A role can't be set through registration or profile updates (the API rejects unknown fields).

## Local development (without Docker)

Requires Node.js 22, PostgreSQL 16 and Redis 7. The easiest way to get the last two is `docker compose up -d postgres redis`.

```bash
# 1. API
cd apps/backend
cp .env.example .env              # defaults match the Compose Postgres/Redis
npm ci
npx prisma migrate deploy         # create the schema
npm run db:seed                   # demo data (wipes existing data)
npm run start:dev                 # http://localhost:4000

# 2. Web (second terminal)
cd apps/frontend
cp .env.example .env.local
npm ci
npm run dev                       # http://localhost:3000
```

The root `package.json` has shortcuts for the same steps (`npm run install:all`, `npm run services`, `npm run dev:api`, `npm run dev:web`, `npm test`, …).

## Environment variables

**API** (`apps/backend/.env`, see [`.env.example`](apps/backend/.env.example)). Validated at startup: the API refuses to start if a required value is missing, if the JWT secret is shorter than 32 characters, or if the example secret is used with `NODE_ENV=production`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✓ | – | PostgreSQL connection string |
| `REDIS_URL` | ✓ | – | Redis connection (Socket.IO adapter, BullMQ, cache) |
| `JWT_ACCESS_SECRET` | ✓ | – | Signs access tokens (≥ 32 chars; `openssl rand -base64 48`) |
| `JWT_ACCESS_TTL` | | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | | `7` | Refresh session lifetime |
| `PORT` | | `4000` | HTTP port |
| `CORS_ORIGINS` | | `http://localhost:3000` | Comma-separated origins allowed for REST and WebSockets |
| `COOKIE_SECURE` | | `false` | Set `true` behind HTTPS |
| `RATE_LIMIT_PER_MINUTE` | | `300` | General requests per minute per client |
| `AUTH_RATE_LIMIT_PER_MINUTE` | | `10` | Login / register / change-password per minute per client |
| `NODE_ENV` | | `development` | `production` enables the placeholder-secret check |
| `TRUST_PROXY` | | `0` | Proxy hops to trust in `X-Forwarded-For`, so rate limits are per visitor behind a load balancer |

**Web** (`apps/frontend/.env.local`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API base URL as seen by the browser. Inlined at build time. |
| `API_PROXY_TARGET` | – | Build-time. When set, the app proxies `/api/*` to this API URL and ignores `NEXT_PUBLIC_API_URL`. Use it when the web app and API are on different sites (see [Deploy](#deploy-free-tier)). |
| `NEXT_PUBLIC_SOCKET_URL` | `API_PROXY_TARGET`, else `NEXT_PUBLIC_API_URL` | WebSocket URL, only if it differs |

**Docker Compose** (optional root `.env`, see [`.env.example`](.env.example)): `JWT_ACCESS_SECRET`, `WEB_ORIGIN`, `PUBLIC_API_URL`, `SEED_DEMO_DATA`, `POSTGRES_PORT`, `REDIS_PORT`, `COOKIE_SECURE`. Every value has a working local default. **Set `JWT_ACCESS_SECRET` for anything beyond your own machine.**

## Database: migrations & seed

Migrations live in `apps/backend/prisma/migrations` and are applied in order.

```bash
cd apps/backend
npx prisma migrate deploy        # apply pending migrations (what Docker does on start)
npx prisma migrate dev           # during development: create a migration from schema changes
npm run db:seed                  # reset and load demo data
npm run db:reset                 # drop everything, re-apply migrations, seed
```

In Docker the entrypoint runs `prisma migrate deploy` on every start, then seeds only when `SEED_DEMO_DATA=true` **and** the database has no users.

The seed validates itself against the permission model: it refuses to run if demo data would show something the API forbids (for example a viewer reporting an issue).

## Testing & coverage

The backend has **118 tests in 19 suites**:

- **Unit tests (9 suites)**: permission policy (every role × action), mention parsing, env validation, error mapping, guards, response envelope, Redis failure tolerance, queue failure tolerance.
- **End-to-end tests (10 suites)**: boot the real Nest app (same middleware, validation and guards as production) against a separate PostgreSQL database and Redis DB 1. They cover auth and session rotation, users, projects, issues and the permission matrix, search/filter/sort/pagination, comments, notifications (through the real BullMQ worker), analytics caching, rate limiting, and real-time delivery with real Socket.IO clients.

```bash
cd apps/backend

# one-time: a separate test database (the tests never touch your dev data)
createdb -h localhost -U devtrack devtrack_test
# or with Compose:  docker compose exec postgres createdb -U devtrack devtrack_test

npm test                  # unit tests only (no database needed)
npm run test:e2e          # e2e tests (migrates the test DB first)
npm run test:all          # everything
npm run test:cov          # everything + coverage report in apps/backend/coverage/
```

The test database and Redis are configurable with `TEST_DATABASE_URL` and `TEST_REDIS_URL`. Defaults: `postgresql://devtrack:devtrack@localhost:5432/devtrack_test` and `redis://localhost:6379/1`.

**Coverage** (latest run): **100 % lines, 99.1 % statements, 98.4 % functions, 76.7 % branches**. Thresholds are enforced in `jest.config.js` (90 / 90 / 90 / 70), so CI fails if coverage drops. Branch coverage is lower mainly because TypeScript compiles decorator metadata in every controller into conditional expressions that no test can meaningfully reach.

Frontend checks: `npm run lint`, `npm run typecheck`, `npm run build` in `apps/frontend`.

## API documentation

Interactive OpenAPI docs: **http://localhost:4000/api/docs**. Click *Authorize* and paste the `accessToken` from `POST /api/auth/login`.

All responses use one envelope: `{ "data": … }`, or `{ "data": [...], "meta": { page, limit, total, totalPages } }` for lists. Errors look like `{ statusCode, error, message, path, timestamp }`.

<details>
<summary>Endpoint overview</summary>

| Method | Path | |
| --- | --- | --- |
| POST | `/api/auth/register` · `/login` · `/refresh` · `/logout` · `/change-password` | Session lifecycle |
| GET | `/api/auth/me` | Current user |
| GET / PATCH | `/api/users/me` | Own profile |
| GET | `/api/users` | Directory (admin, project manager) |
| PATCH | `/api/users/:id` | Role / active status (admin) |
| GET / POST | `/api/projects` | List (paginated, searchable) / create |
| GET / PATCH / DELETE | `/api/projects/:projectId` | Details with members, labels, permissions |
| GET / POST / DELETE | `/api/projects/:projectId/members[/:userId]` | Membership |
| GET / POST / DELETE | `/api/projects/:projectId/labels[/:labelId]` | Labels |
| GET / POST | `/api/projects/:projectId/issues` | Search, filter, sort, paginate / create |
| GET | `/api/projects/:projectId/board` | Issues grouped by status with column totals |
| GET | `/api/projects/:projectId/analytics` · `/activity` | Charts data, activity feed |
| GET / PATCH / DELETE | `/api/issues/:issueId` | Issue details / update / delete |
| PATCH | `/api/issues/:issueId/status` | Move on the board |
| GET | `/api/issues/:issueId/activity` | History |
| GET / POST | `/api/issues/:issueId/comments` | Comments |
| PATCH / DELETE | `/api/comments/:commentId` | Edit / delete a comment |
| GET | `/api/notifications` · `/unread-count` | Notifications |
| PATCH | `/api/notifications/:id/read` · `/read-all` | Mark read |
| GET | `/api/analytics/me` | Personal dashboard |
| GET | `/api/health` | Database and Redis status (public) |
| GET | `/api/health/live` | Process liveness only, no database query (for keep-alive pings) |

**WebSocket** (Socket.IO, same origin as the API): connect with `auth: { token: <accessToken> }`, then emit `project:join` / `project:leave` with `{ projectId }`. Server events: `issue:created`, `issue:updated`, `issue:deleted`, `comment:created`, `comment:updated`, `comment:deleted`, `notification:new`.

</details>

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and every pull request.

| Job | Steps |
| --- | --- |
| **Backend** | Install; generate the Prisma client; lint; formatting check; **fail if the schema has drifted from the migrations**; unit + e2e tests with coverage thresholds against Postgres and Redis service containers; upload the coverage report; build |
| **Frontend** | Install; lint; typecheck; production build |
| **Docker** (after both pass) | Build both images; `docker compose up --wait` until every healthcheck passes; smoke-test health, seeded login, Swagger and the web app; restart the API and **confirm data survives** (the seed must not wipe it); print logs on failure |

## Deploy (free tier)

A setup that costs nothing and keeps the demo link permanent:

| Part | Host | Why |
| --- | --- | --- |
| Web app | **Vercel** (Hobby) | Native Next.js hosting, always on |
| API + Redis | **Render** (free web service + free Key Value) | Long-running process, needed for WebSockets and the BullMQ worker |
| PostgreSQL | **Neon** (free) | Doesn't expire (Render's free Postgres is deleted after 30 days) |

**Why the web app proxies the API.** `*.vercel.app` and `*.onrender.com` are different sites, so browsers treat the API's login cookie as third-party and don't send it. Without the proxy, every page reload would log users out. With `API_PROXY_TARGET` set, the browser only talks to the Vercel app, which forwards `/api/*` to Render, so the cookie is first-party. WebSockets connect to Render directly; they authenticate with the access token, not the cookie.

1. **Neon:** create a project (pick the region closest to your Render region) and copy the **direct** connection string, the one *without* `-pooler`, ending in `?sslmode=require`.
2. **Render:** *New → Blueprint*, select this repository. [`render.yaml`](render.yaml) creates the API and Redis. When asked:
   - `DATABASE_URL`: the Neon string.
   - `CORS_ORIGINS`: your future Vercel URL, e.g. `https://devtrack-yourname.vercel.app` (you can edit it later).

   The first deploy runs migrations and seeds the demo accounts. Check `https://<your-api>.onrender.com/api/health`.
3. **Vercel:** *Add New → Project*, import the repository, set **Root Directory** to `apps/frontend`, and add the environment variable `API_PROXY_TARGET=https://<your-api>.onrender.com`. Deploy.
4. If the Vercel URL differs from what you put in `CORS_ORIGINS`, update it on Render. Real-time updates need it, because the WebSocket connects cross-origin.
5. **Optional, avoid the one-minute cold start:** ping `https://<your-api>.onrender.com/api/health/live` every 10 minutes with a free uptime monitor (e.g. UptimeRobot or cron-job.org). That endpoint doesn't touch the database, so Neon can still sleep. One always-on free service fits within Render's 750 free hours a month.

**Free-tier caveats:**
- Render's free Redis isn't persisted. A restart only loses queued notification jobs and cached analytics, never data.
- Neon's free plan includes 0.5 GB of storage and 100 compute-hours per month, plenty for a demo.
- Limits change; check each provider's pricing page.

## Screenshots

These are real screenshots of the seeded app, captured by the browser checks described below.

| | |
| --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) **Dashboard**: your open work, most urgent first | ![Project overview](docs/screenshots/project-overview.png) **Project overview**: metrics, charts, workload, activity |
| ![Issue detail](docs/screenshots/issue-detail.png) **Issue**: inline editing, comments with @mentions, history | ![Issue list](docs/screenshots/issue-list.png) **List**: search, filters and sorting kept in the URL |
| ![Notifications](docs/screenshots/notifications.png) **Notifications** | ![Login](docs/screenshots/login.png) **Login** with demo accounts |

<p>
  <img src="docs/screenshots/mobile-board.png" alt="Board on a phone" width="240">
  <img src="docs/screenshots/mobile-issue.png" alt="Issue on a phone" width="240">
</p>

## Design decisions

- **Two separate apps, not a Next.js API.** The API is a standalone NestJS service with its own lifecycle, so the frontend could be replaced or a mobile client added without touching it.
- **Access token in memory, refresh token in an `httpOnly` cookie.** Nothing readable by scripts is persisted, which limits the damage from an XSS bug. The cost is one refresh call per page load.
- **Refresh-token rotation with a grace window.** Strict rotation logs users out when two tabs refresh at once. This showed up in browser testing and is covered by tests for the parallel, grace and reuse cases.
- **Opaque refresh tokens stored as SHA-256 hashes.** Sessions can be revoked server-side (logout, password change, deactivation), and a database leak doesn't expose usable tokens.
- **404, not 403, for projects you're not a member of**, so project existence isn't leaked.
- **Permissions as pure functions** (`policy.ts`): easy to read, exhaustively unit-tested, and mirrored to the UI via `permissions` blocks rather than duplicated logic.
- **Notifications via a queue.** Recipient calculation touches several tables. Doing it in a BullMQ worker keeps writes fast and adds retries. A failed enqueue is logged and never fails the user's request.
- **Prisma's Rust-free client** (`engineType = "client"` + `@prisma/adapter-pg`). The runtime needs no native query engine binary.
- **Trigram indexes** (`pg_trgm`) so `ILIKE` search on titles and descriptions stays fast as projects grow.

## Known limitations

- **How this was verified.** The code was developed and tested in an environment without Docker. There, all backend tests passed, the frontend built, and a headless-browser run of the main user flows passed against the running stack.
  - The Docker images were checked by reproducing their build steps and runtime layout outside Docker (including starting the API from production-only dependencies and serving the Next.js standalone build).
  - `docker compose up` itself and the GitHub Actions workflow have not been executed yet. The CI **Docker** job is designed to prove both on the first push.
- **Migrations.** The initial migration was generated with `prisma migrate diff`. The second (`refresh_token_rotation`) was written by hand and checked against a schema generated by Prisma. The CI drift check guards against mismatches from here on.
- **Deployment config is untested on the real hosts.** Proxy mode was tested locally, using two different sites (`127.0.0.1` for the web app, `localhost` for the API): sessions survive reloads and real-time works. Without the proxy, the reload logout was reproduced. `render.yaml` and the Vercel setup haven't been run on Render or Vercel, and `TRUST_PROXY=2` assumes each of Vercel and Render adds one `X-Forwarded-For` hop. If rate limits seem shared between visitors, that value is the first thing to check.
- **Rate limiting is per API instance** (in-memory). Real-time rooms already work across instances through Redis; a shared limiter would need Redis-backed throttler storage.
- **Board ordering** within a column is by priority, then age. There's no manual drag-to-reorder within a column. The board shows up to 100 issues per column, with a link to the full list.
- **Notifications are in-app only** (no email). There are no file attachments, and there is no dark mode.
- **Seed resets data.** `npm run db:seed` deletes everything first. Docker only seeds an empty database.
- The API logs a harmless `pg` deprecation warning that comes from Prisma's driver adapter, not application code.

## Project structure

```
devtrack/
├── apps/
│   ├── backend/                    NestJS API
│   │   ├── prisma/                 schema.prisma, migrations/, seed.ts
│   │   ├── src/
│   │   │   ├── access/             permission policy (pure functions) + project access checks
│   │   │   ├── analytics/          project & personal metrics, Redis cache
│   │   │   ├── auth/               register/login/refresh/logout, JWT strategy, session cookies
│   │   │   ├── comments/
│   │   │   ├── common/             guards, decorators, exception filter, response envelope
│   │   │   ├── config/             environment validation
│   │   │   ├── health/
│   │   │   ├── issues/             CRUD, search/filter/sort, board, activity diffing
│   │   │   ├── notifications/      BullMQ queue + worker, recipients, @mention parsing
│   │   │   ├── prisma/  redis/
│   │   │   ├── projects/           projects, members, labels
│   │   │   ├── realtime/           Socket.IO gateway + Redis adapter
│   │   │   ├── users/
│   │   │   ├── bootstrap.ts        shared app setup (used by main.ts and tests)
│   │   │   └── main.ts
│   │   ├── test/                   e2e suites + helpers
│   │   ├── Dockerfile  docker-entrypoint.sh  .env.example
│   └── frontend/                   Next.js app
│       ├── src/app/                routes: (auth)/login, register · (app)/dashboard, projects,
│       │                           projects/[projectId]/{board,issues}, issues/[issueId], notifications, settings, admin/users
│       ├── src/components/         ui/ primitives · issues/ · projects/ · layout/
│       ├── src/lib/                API client, auth & socket providers, query keys, types
│       └── Dockerfile  .env.example
├── docs/screenshots/
├── .github/workflows/ci.yml
├── docker-compose.yml
├── render.yaml                     Render Blueprint (API + Redis)
├── .env.example                    optional Compose overrides
└── package.json                    convenience scripts
```
