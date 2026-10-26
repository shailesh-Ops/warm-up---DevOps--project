# Orbit Chat ✦

**A polished, full-stack three-tier real-time chat application.** Built with React, Vite, Tailwind CSS, Express, Socket.IO, PostgreSQL and Redis. Includes a fully custom, responsive interface — not a chat-service SDK wrapper or a collection of mock screens.

## Features

- Real registration, login and logout (bcrypt password hashes; secure, Redis-backed HTTP-only browser sessions)
- One-to-one conversations and named groups (2–30 other group members)
- Real-time messages, typing indicators, user presence and reconnect syncing via Socket.IO
- Persisted conversation history with efficient cursor-based 40-message pages
- Message editing, soft-delete and emoji reactions
- Unread counts, read markers and read indicators
- User discovery, conversation filtering, group membership viewing and leaving
- Editable profile name, status and bio
- Responsive desktop/tablet/mobile UI with accessible button labels and keyboard message sending
- API validation, SQL parameterization, authorization checks, auth rate limiting, origin checks, safe error responses

**Scope:** The app supports **text chat**; it deliberately does not show fake audio/video-call or upload buttons. Images/files, notifications, email verification, password recovery, moderation and end-to-end encryption are **not** part of this release. No Docker, CI/CD, reverse-proxy, infrastructure, Terraform, Kubernetes or deployment configuration has been added. These remain the user's DevOps responsibility.

## Three-tier architecture

```text
  Tier 1 — Browser (React + Tailwind + Vite)
         | HTTP JSON (with cookie) + Socket.IO
         v
  Tier 2 — Application (Node.js + Express + Socket.IO)
         |                         |
         v                         v
  Tier 3 — PostgreSQL         Redis
         durable data         login sessions
```

PostgreSQL is the **source of truth** for accounts, conversations, membership, messages, reactions and read markers. Redis **stores authenticated sessions**. Live presence is tracked in memory **for one API process**, so multi-process scaling needs a shared presence design and Socket.IO adapter (see `docs/ARCHITECTURE.md`).

## Requirements

- Node.js **22 LTS recommended** (minimum 20.19)
- npm 10+
- PostgreSQL **14+**, reachable via `DATABASE_URL`
- Redis **6.2+**, reachable via `REDIS_URL`
- Two fresh browser profiles / incognito windows for real-time testing

## Quick start (local development)

**1. Extract and enter the project folder**

```bash
cd orbit-chat
npm install
```

**2. Create the configuration files**

Linux/macOS/WSL:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

**3. Edit `apps/api/.env`** with your existing local PostgreSQL and Redis connection addresses. **Change `SESSION_SECRET` to a unique random string of at least 32 characters.** Example secure generation:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The defaults expect PostgreSQL on `127.0.0.1:5432`, Redis on `127.0.0.1:6379`, frontend on `localhost:5173` and API on `localhost:4000`. Set these appropriately for your machine. If Redis uses a password, `REDIS_URL` can be `redis://:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:6379` (do not commit passwords).

**4. Create the empty PostgreSQL database** (using a PostgreSQL user permitted to create databases):

```bash
psql -U postgres -c "CREATE DATABASE orbit_chat;"
```

If you have already created it, skip this command. For PostgreSQL with non-`postgres` credentials, adjust `DATABASE_URL` and database creation accordingly.

**5. Initialize the application tables**

```bash
npm run db:migrate
```

**6. Start both applications**

```bash
npm run dev
```

Open **http://localhost:5173**. Register user A. Open an incognito/private browser window and register user B. From A, click the purple new-conversation button, search for B, start a direct chat, and send messages. Both windows should show real-time updates.

> If Postgres or Redis is not running/reachable, the API will refuse to start. That is intentional: there are no fake in-memory accounts/messages.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Both apps with watchers |
| `npm run start:api` | Start API without a file watcher |
| `npm run db:migrate` | Apply idempotent schema creation |
| `npm run build` | Compile frontend static assets into `apps/web/dist` |
| `npm run check` | Run Node tests + frontend production build |
| `npm run test -w apps/api` | Run API validation tests |

The `/api/health` endpoint checks both PostgreSQL and Redis, returning `{ "ok": true }` when connected.

## Monorepo overview

```text
orbit-chat/
├── apps/
│   ├── api/
│   │   ├── .env.example             # App connection settings (template)
│   │   ├── sql/001_init.sql         # Relational tables + indexes
│   │   ├── scripts/migrate.js       # Schema initializer
│   │   ├── src/
│   │   │   ├── server.js             # Express + socket server
│   │   │   ├── routes.js             # HTTP endpoints + access checks
│   │   │   ├── socket.js             # Live events + membership rooms
│   │   │   ├── session.js            # Redis-backed auth sessions
│   │   │   ├── validation.js         # Zod request validators
│   │   │   ├── database.js           # PostgreSQL pool
│   │   │   └── redis.js              # Redis client
│   │   └── tests/validation.test.js
│   └── web/
│       ├── .env.example
│       ├── src/
│       │   ├── App.jsx              # User state + real-time logic
│       │   ├── components/
│       │   │   ├── AuthScreen.jsx
│       │   │   ├── Sidebar.jsx
│       │   │   ├── ChatPanel.jsx
│       │   │   ├── Dialogs.jsx
│       │   │   └── Shared.jsx
│       │   ├── lib/api.js
│       │   ├── lib/format.js
│       │   └── styles.css
│       └── vite.config.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── QA-CHECKLIST.md
└── package.json                # npm workspaces scripts
```

## Testing and release-readiness disclosure

Static source checks can run without the database. **Full installation, React/Vite build, SQL integration testing and cross-browser acceptance testing still must be completed in an environment with npm access and running PostgreSQL/Redis.** This project is a production-oriented application foundation with real functionality, *not a certification of production readiness*. Review `docs/QA-CHECKLIST.md` and `docs/ARCHITECTURE.md` before any live release.

## Ownership and DevOps boundary

Application developer owns the React frontend, Express API, contracts, schema, runtime configuration and application-level security. The project owner/DevOps engineer supplies and operates infrastructure, secrets distribution, TLS/domain/proxies, deployment, backups, environment monitoring and scale strategy separately. No infrastructure implementation is bundled.
