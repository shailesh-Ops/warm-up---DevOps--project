// Live API test. Needs the API running (npm run dev -w apps/api) plus PostgreSQL and Redis.
//   npm run test:integration -w apps/api          (API_URL defaults to http://localhost:4000)
// It creates throw-away users (…@orbit.test) and deletes them afterwards.
import 'dotenv/config';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const ORIGIN = process.env.TEST_ORIGIN || 'http://localhost:8000';
const run = Math.random().toString(36).slice(2, 8);
const password = 'correct-horse-battery';

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, origin = ORIGIN } = {}) => {
    const res = await fetch(`${API}/api${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) cookie = c.startsWith('orbit.sid=; ') || /Expires=Thu, 01 Jan 1970/.test(c) ? '' : c.split(';')[0];
    const text = await res.text();
    return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null, cookie: () => cookie };
  };
}

const users = [];
after(async () => {
  if (!process.env.DATABASE_URL) return;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const ids = users.map(u => u.id).filter(Boolean);
    await pool.query('DELETE FROM conversations WHERE created_by = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
  } finally { await pool.end(); }
});

test('health is ok and the index lists register/login', async () => {
  const a = client();
  assert.equal((await a('/health')).data.ok, true);
  const index = await (await fetch(`${API}/api`)).json();
  assert.ok(index.endpoints.includes('POST /api/register') && index.endpoints.includes('POST /api/login'));
});

test('CORS allows the web origin and blocks unknown ones', async () => {
  const ok = await fetch(`${API}/api/me`, { headers: { Origin: ORIGIN } });
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
  const pre = await fetch(`${API}/api/login`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
  const bad = await fetch(`${API}/api/me`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  const csrf = await client()('/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' }, origin: 'https://evil.example' });
  assert.equal(csrf.status, 403);
});

test('register → me → logout → login (flat paths)', async () => {
  const a = client();
  const email = `a-${run}@orbit.test`;
  const bad = await a('/register', { method: 'POST', body: { name: 'Ada', email, password: 'short' } });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /at least 10 characters/);
  const reg = await a('/register', { method: 'POST', body: { name: 'Ada Test', email, password } });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.email, email);
  users.push(reg.data.user);
  assert.equal((await a('/me')).data.user.id, reg.data.user.id);
  assert.equal((await a('/register', { method: 'POST', body: { name: 'Ada Test', email: email.toUpperCase(), password } })).status, 409);
  assert.equal((await a('/logout', { method: 'POST' })).status, 204);
  assert.equal((await a('/me')).status, 401);
  assert.equal((await a('/logout', { method: 'POST' })).status, 204, 'logout with no session is still fine');
  assert.equal((await a('/login', { method: 'POST', body: { email, password: 'wrong-password-123' } })).status, 401);
  const login = await a('/login', { method: 'POST', body: { email: `  ${email.toUpperCase()} `, password } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.id, reg.data.user.id);
});

test('legacy /auth/* paths still work', async () => {
  const a = client();
  const email = `legacy-${run}@orbit.test`;
  const reg = await a('/auth/register', { method: 'POST', body: { name: 'Legacy', email, password } });
  assert.equal(reg.status, 201);
  users.push(reg.data.user);
  assert.equal((await a('/auth/me')).status, 200);
  assert.equal((await a('/auth/logout', { method: 'POST' })).status, 204);
  assert.equal((await a('/auth/login', { method: 'POST', body: { email, password } })).status, 200);
});

test('two users chat: direct conversation, messages, unread, real-time delivery', async (t) => {
  const A = client(), B = client();
  const ra = await A('/register', { method: 'POST', body: { name: 'Alice Chat', email: `alice-${run}@orbit.test`, password } });
  const rb = await B('/register', { method: 'POST', body: { name: 'Bob Chat', email: `bob-${run}@orbit.test`, password } });
  users.push(ra.data.user, rb.data.user);
  const found = await A(`/users?search=${encodeURIComponent('Bob Chat')}`);
  assert.ok(found.data.users.some(u => u.id === rb.data.user.id));
  const conv = await A('/conversations', { method: 'POST', body: { kind: 'direct', userId: rb.data.user.id } });
  assert.equal(conv.status, 201);
  const again = await B('/conversations', { method: 'POST', body: { kind: 'direct', userId: ra.data.user.id } });
  assert.equal(again.data.conversationId, conv.data.conversationId, 'direct pair is unique');

  let io;
  try { ({ io } = await import('socket.io-client')); } catch { t.diagnostic('socket.io-client not installed; skipping real-time check'); }
  let received;
  let socket;
  if (io) {
    const cookie = (await B('/me')).cookie();
    socket = io(API, { transports: ['websocket'], extraHeaders: { Cookie: cookie, Origin: ORIGIN } });
    received = new Promise((resolve, reject) => { socket.on('message:new', resolve); socket.on('connect_error', reject); setTimeout(() => reject(new Error('no message:new within 5s')), 5000); });
    await new Promise(resolve => socket.on('connect', resolve));
  }
  const sent = await A(`/conversations/${conv.data.conversationId}/messages`, { method: 'POST', body: { body: 'Hello Bob 👋' } });
  assert.equal(sent.status, 201);
  if (io) { assert.equal((await received).body, 'Hello Bob 👋'); socket.disconnect(); }
  const list = await B('/conversations');
  assert.equal(list.data.conversations[0].unreadCount, 1);
  const msgs = await B(`/conversations/${conv.data.conversationId}/messages`);
  assert.equal(msgs.data.messages.length, 1);
  assert.equal((await B(`/conversations/${conv.data.conversationId}/read`, { method: 'POST' })).status, 200);
  assert.equal((await B('/conversations')).data.conversations[0].unreadCount, 0);
  const outsider = client();
  const rc = await outsider('/register', { method: 'POST', body: { name: 'Carol', email: `carol-${run}@orbit.test`, password } });
  users.push(rc.data.user);
  assert.equal((await outsider(`/conversations/${conv.data.conversationId}/messages`)).status, 404);
});
