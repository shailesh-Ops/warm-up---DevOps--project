# QA and acceptance test checklist

**Do not mark these complete just because code exists.** A deployment candidate should be exercised with real PostgreSQL, Redis and browser sessions.

## Local setup

- [ ] Run `npm install` from repo root using Node 22.
- [ ] Copy and configure both `.env.example` files. Generate a new strong `SESSION_SECRET`.
- [ ] Create `orbit_chat` in PostgreSQL and run `npm run db:migrate`.
- [ ] Start PostgreSQL and Redis. Verify `npm run dev` starts both apps.
- [ ] Check API `http://localhost:4000/api/health` returns `{ "ok": true }`.
- [ ] With the API running, `npm run test:integration -w apps/api` passes (register/login, CORS, chat, real-time).
- [ ] Open the web app from every address listed in `WEB_ORIGIN`; the browser console shows no CORS errors.
- [ ] Run `npm run check` (API tests + Vite production build).

## Accounts

- [ ] Register Alice in normal Chrome session. Register Bob in incognito/private profile.
- [ ] Reject duplicate Alice email regardless of letter case; reject password under 10 chars.
- [ ] Sign in with valid password; reject invalid password without leaking user existence.
- [ ] Refresh a logged-in page and verify session persists; sign out and verify session ends.
- [ ] In another tab with same browser session, log out and confirm that session's socket disconnects.
- [ ] Edit display name, status and bio. Confirm data persists after refresh.

## Messaging

- [ ] Search Bob; start a direct conversation. Start the same conversation again: no duplicate created.
- [ ] Send 2 messages. See near-instant delivery in both browsers without page refresh.
- [ ] Group with Alice, Bob and a third account can send/receive messages.
- [ ] Check online badge/typing indicator; check disconnect/online status change.
- [ ] Edit own message; other user sees edit. Delete own message; other user sees tombstone.
- [ ] Add and remove ❤️/👍 reactions. User B cannot edit A's messages.
- [ ] Unread count increases on B while another chat is selected. Opening unread chat resets count.
- [ ] Read indicators update when B opens Alice's message.
- [ ] Load more than 40 messages; older pages load without duplicates or skipped rows.
- [ ] Disconnect B's internet briefly, send a message from A, reconnect B; latest messages resync.
- [ ] Group owner leaves and ownership passes to another member; group remains usable.
- [ ] Directly request messages from an unjoined conversation UUID; expect 404.

## UI

- [ ] Test at mobile widths 320, 375, 390, 430px and tablet widths 768, 1024px.
- [ ] Test desktop at 1280px and 1920px. No horizontal overflow, clipped menus or hidden send buttons.
- [ ] Enter sends; Shift+Enter inserts a line break; mobile keyboard sends via button.
- [ ] Modals close with Escape; interactive elements have discernible labels; focus visible.
- [ ] Validate long chat names, long messages, multiline messages, large groups and empty results.
- [ ] Test Chrome, Edge, Firefox and mobile browsers when available.

## Release considerations (not built into the app)

- [ ] Define origin + browser cookie topology, session secret rotation plan and secure runtime settings.
- [ ] Resolve account recovery/email verification, abuse controls, account deletion, retention and legal requirements.
- [ ] Run dependency, security, integration and accessibility scans.
- [ ] Decide whether to stay one API process or implement shared socket presence + adapter and rate limits before scaling.
- [ ] DevOps engineer separately provisions runtime/services, TLS, backups, monitoring and deployment path.

## Known verification status of this delivered source

API unit tests (`npm test -w apps/api`), the frontend production build, and the live API integration test (`npm run test:integration -w apps/api`: register/login/logout on both path styles, CORS allow/deny, direct chat, unread counts, real-time Socket.IO delivery, automatic schema creation on an empty database) were run against PostgreSQL 16 and Redis. Browser-level UI testing, cross-browser QA and the manual checklist above are still to be done by you before any release.
