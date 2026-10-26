# Architecture, design decisions and developer → DevOps handoff

## 1. App structure

**Tier 1 — UI**: React with Vite, Tailwind CSS v4, lucide-react icons, Socket.IO client, date-fns. Navigation is an authenticated single-page app with chat selection, search, modals and mobile view. `src/lib/api.js` is the one HTTP wrapper; it always sends cookie credentials. Frontend configuration only exposes the public API address (`VITE_API_URL`).

**Tier 2 — API**: Node.js (ES modules) and Express 5. HTTP routes validate JSON using Zod; all private routes check `req.session.userId` and membership/ownership against PostgreSQL. Socket.IO authorizes through the same Redis session. Both layers have a common origin allowlist. Passwords use bcrypt, cost factor 12. Sessions are regenerated on login/register and destroyed on logout (including associated live sockets). Message payloads are limited to 4000 characters and regular POST JSON is limited to 32KB.

**Tier 3 — data**: PostgreSQL stores durable records; Redis stores HTTP session data with a 7-day cookie lifespan. Socket.IO uses in-memory socket presence **within one backend instance**. Neither PostgreSQL nor Redis is queried directly by the browser.

## 2. Relational model

```text
users (id PK, name, email unique case-insensitive, password_hash, avatar_color,
       bio, status, last_seen_at, created_at)
       |
       +--- conversation_members (conversation_id FK, user_id FK, role, last_read_at)
       |                     |
       |                 conversations (id PK, kind direct/group, name, direct_key,
       |                                created_by FK, updated_at, created_at)
       |                     |
       +--- messages (id PK, conversation_id FK, sender_id FK, body,
       |              edited_at, deleted_at, created_at)
       |                     |
       +--- message_reactions (message_id FK, user_id FK, emoji)
```

The `direct_key` is a consistent sorted pair of user UUIDs, unique in the database. Trying to start another one-to-one conversation reuses the existing one. Group owners are automatically transferred when an owner leaves a group. When the final group member leaves, the group is deleted. Individual message deletion is soft deletion, so history position remains while body is removed. New message insertion and conversation timestamp update share a database transaction.

## 3. Application data and event flows

**Sign-in:** browser `POST /api/auth/login` → bcrypt credential check against PostgreSQL → session regeneration → session stored in Redis → HTTP-only session cookie → authenticated React app.

**Message:** browser `POST /api/conversations/:id/messages` → session check → DB membership check → transactional message insert and conversation update → message record fetched → `message:new` emitted to that conversation's Socket.IO room → `conversation:updated` emitted to its members so lists and unread counts refresh. Messages are not accepted as client-originated Socket.IO write events, intentionally allowing centralized HTTP validation.

**Read:** opening a conversation updates `conversation_members.last_read_at`; a `conversation:read` event lets other members update read indicators. A counted unread message must be from another user, non-deleted and newer than the stored read marker.

**Typing / online:** each authenticated socket joins its user and authorized conversation rooms. Typing events require DB membership (and are server-throttled). Presence broadcasts go only to users in shared conversation rooms, not every account globally. The socket connection tracks online/offline; user discovery includes current in-process presence. After reconnect, the client fetches missed recent messages and refreshes conversation lists.

## 4. Security controls in app code

- Password hashes are never returned to frontend.
- IDs are UUIDs; SQL is parameterized rather than built with user-provided literal SQL.
- Unauthorized requests return 401, missing/unjoined conversations return 404.
- Users can edit/delete only their own messages; reactions require group membership.
- Message content renders as text (React escapes it), not `dangerouslySetInnerHTML`.
- Session cookies are HTTP-only, SameSite=Lax, secure in `NODE_ENV=production`.
- State-changing cross-origin requests are checked against `WEB_ORIGIN` (browser requests include `Origin`).
- Helmet headers; auth rate limiting; defined payload and field length limits.
- Sessions are stored in Redis; login regenerates the ID to reduce session fixation risk.

**Security decisions still required before public release:** harden invitation/contact privacy and abuse rules, consider mandatory email verification, password reset and account deletion, central/shared rate limiting, multi-tenant moderation policies, abuse-reporting flow, CSP policy calibrated to production assets, security audit, additional integration/e2e tests and formal data retention policy. Origin checking permits non-browser requests with no `Origin`; this is not a substitute for comprehensive CSRF threat modeling under arbitrary deployment origins. Use a shared site (e.g., `app.example.com` and `api.example.com`) or adapt session cookie policy appropriately. **This is not end-to-end encrypted.**

## 5. Required application runtime environment

| Variable | Owner | Description |
|---|---|---|
| `PORT` | App/DevOps | API listen port (defaults to 4000) |
| `NODE_ENV` | Runtime | `development` or `production`; secure cookie when production |
| `WEB_ORIGIN` | DevOps config | Allowed browser origin(s), comma-separated, exact schemes/ports |
| `DATABASE_URL` | DevOps secret | PostgreSQL connection string (`postgresql://…`) |
| `REDIS_URL` | DevOps secret | Redis connection string (password/TLS if applicable) |
| `SESSION_SECRET` | DevOps secret | Strong random string, at least 32 characters |
| `TRUST_PROXY` | DevOps config | `1` only behind a trusted proxy setting forwarded headers correctly |
| `VITE_API_URL` | Frontend config | Public browser-facing API base URL (no `/api` suffix) |

**Do not expose** `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET` in the frontend or Vite-prefixed environment variables. Frontend `VITE_` fields become public assets. Redis is currently **required**, not optional. The API refuses startup if database/Redis cannot be reached.

## 6. DevOps responsibilities / remaining scale work (not implemented here)

Application runtime dependencies: Node, PostgreSQL, Redis, a host/origin that supports cookies + WebSockets, and encrypted network paths for nonlocal traffic. The DevOps owner decides how to provide, secure, operate and back up these services. The app team needs the database URL, Redis URL, public browser/API origins, app secret and correct trust-proxy policy.

The v1 app is designed for **one API process**: active socket presence and auth rate-limit counters live in memory. For horizontal replicas, the app team must implement shared presence and a Socket.IO Redis adapter (plus a central rate-limit store). If the DevOps owner chooses multiple API instances before that app change, online indicators and socket fan-out will be inconsistent. That app change must happen first; do not paper over it with infra alone.

No deployment pipeline, YAML files, container files, cloud resources, alerts, backups, network definitions, service managers or storage buckets are included.

## 7. API acceptance criteria for user/DevOps handoff

- PostgreSQL and Redis accessible using the provided environment settings.
- `/api/health` returns 200 JSON `{"ok":true}` when both are healthy, 503 otherwise.
- Two authenticated browser sessions can exchange messages instantly over Socket.IO.
- Logging out disconnects that session's sockets and invalidates the HTTP session.
- App user A cannot GET/POST messages in a conversation belonging only to B and C.
- Frontend refresh does not log out a valid session; all messages persist in PostgreSQL.
- Browser mobile widths 320px–768px show a single-screen chat/navigation flow without horizontal overflow.
