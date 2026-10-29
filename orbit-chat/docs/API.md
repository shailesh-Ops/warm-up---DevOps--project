# HTTP and real-time API contract

Base URL: `/api`. JSON request and response bodies; the frontend uses `credentials: 'include'`, with the Redis-backed browser session cookie. All endpoints except register/login/logout/health need a valid session. The web app's origin must be listed in the API's `WEB_ORIGIN` setting (comma-separated), otherwise browsers block the calls with a CORS error. Errors are `{ "error": "Human-readable message" }`; unknown or internal failures return a safe 500 response.

## Authentication and profile

| HTTP | Path | Request | Response |
|---|---|---|---|
| POST | `/register` | `{name,email,password}` | `201 {user}` (also signs you in) |
| POST | `/login` | `{email,password}` | `200 {user}` |
| POST | `/logout` | none | `204` (works even if the session already expired) |
| GET | `/me` | — | `{user}` or `401` |
| PATCH | `/me` | `{name?,bio?,status?}` | `{user}` |
| GET | `/users?search=alex` | — | `{users:[…]}` (up to 30) |
| GET | `/health` | — | `{ok:true}` or `503 {ok:false}` |

The older `/auth/register`, `/auth/login`, `/auth/logout` and `/auth/me` paths remain as aliases of the four routes above. `GET /api` returns a small index of the main endpoints.

Quick check from a terminal:

```bash
curl -i -X POST http://localhost:4000/api/register -H 'Content-Type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com","password":"correct-horse-battery"}'
```

`name`: 2–60 characters. Email is normalized lowercase and unique case-insensitively; password: 10–128 characters, limited to 72 UTF-8 bytes because bcrypt is used. Profiles return `id,name,email,avatarColor,bio,status,lastSeenAt,createdAt`. User discovery does not reveal email addresses.

## Conversations

| HTTP | Path | Request | Response |
|---|---|---|---|
| GET | `/conversations` | — | `{conversations:[…]}` up to 75 newest |
| POST | `/conversations` | `{kind:"direct",userId:"uuid"}` | `201 {conversationId}` |
| POST | `/conversations` | `{kind:"group",name:"Design crew",userIds:["uuid1","uuid2"]}` | `201 {conversationId}` |
| DELETE | `/conversations/:id/members/me` | — | `204` (groups only) |
| GET | `/conversations/:id/messages` | optional `?before=<oldest_message_uuid>` | `{messages:[…],hasMore:boolean}` |
| POST | `/conversations/:id/messages` | `{body:"Hi!"}` | `201 {message}` |
| POST | `/conversations/:id/read` | — | `{lastReadAt}` |

Messages are sorted oldest to newest *within each page*; the page size is 40. The `before` cursor points to the ID of the oldest loaded message and pages strictly before it, using the `(created_at,id)` tuple. Conversation summary contains `id,kind,name,members,unreadCount,lastMessage,createdAt,updatedAt,role,lastReadAt`. Member objects contain their own `lastReadAt`, used for read indicators. Limit group creation to the current user plus 2–30 other unique users. Direct conversation pairs are unique.

## Editing, deleting, reactions

| HTTP | Path | Request | Response |
|---|---|---|---|
| PATCH | `/messages/:id` | `{body:"Corrected text"}` | `{message}` |
| DELETE | `/messages/:id` | — | `{message}` soft-deleted |
| POST | `/messages/:id/reactions` | `{emoji:"👍"}` | `{message}` toggles own reaction |

Valid reactions: ❤️ 👍 😂 😮 🎉 🔥. Only the sender can edit/delete. A reaction is created on the first click and removed on the next click by the same user.

Message model:

```json
{
  "id": "uuid", "conversationId": "uuid", "senderId": "uuid",
  "senderName": "Alex", "senderAvatarColor": "#6C63E6",
  "body": "Hello!", "createdAt": "2026-10-15T10:00:00.000Z",
  "editedAt": null, "deletedAt": null,
  "reactions": [{"emoji":"❤️","userId":"uuid"}]
}
```

## Socket.IO events

Client connects to the same origin as API, with session cookie. Unauthorized connections are rejected. **Writing a message uses the HTTP API**, not a Socket.IO write event.

| Direction | Event | Example payload |
|---|---|---|
| Client → server | `conversation:join` | `"conversation-uuid"` (membership checked) |
| Client → server | `typing:set` | `{conversationId,typing:true}` |
| Server → client | `message:new` | message object |
| Server → client | `message:updated` | message object |
| Server → client | `conversation:created` | `{conversationId}` |
| Server → client | `conversation:updated` | `{conversationId}` |
| Server → client | `conversation:removed` | `{conversationId}` |
| Server → client | `conversation:read` | `{conversationId,userId,lastReadAt}` |
| Server → client | `typing:changed` | `{conversationId,userId,typing}` |
| Server → client | `presence:changed` | `{userId,online,lastSeenAt?}` |
| Server → client | `profile:updated` | user object (own sessions) |
| Server → client | `profile:changed` | `{userId}` (shared conversation members) |

API HTTP statuses: `400` invalid data (the `error` text is user-friendly, e.g. "Password must be at least 10 characters."); `401` unauthenticated; `403` forbidden action/origin; `404` no access or not found; `409` conflict; `429` too many failed auth attempts (successful logins do not count); `500` internal issue; `503` dependency health degraded.
