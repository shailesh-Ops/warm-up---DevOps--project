import 'dotenv/config';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketServer } from 'socket.io';
import { pool } from './database.js';
import { redis } from './redis.js';
import { sessionMiddleware } from './session.js';
import { initializeSocket } from './socket.js';
import { buildAllowedOrigins } from './origins.js';
import { runMigrations } from './migrate.js';
import routes from './routes.js';

const { DATABASE_URL, REDIS_URL, SESSION_SECRET, WEB_ORIGIN } = process.env;
if (!DATABASE_URL || !REDIS_URL || !SESSION_SECRET || SESSION_SECRET.length < 32 || SESSION_SECRET.startsWith('replace-with-') || !WEB_ORIGIN) {
  console.error('Set DATABASE_URL, REDIS_URL, WEB_ORIGIN and a SESSION_SECRET of at least 32 characters. See .env.example.');
  process.exit(1);
}

const { origins, invalid } = buildAllowedOrigins(WEB_ORIGIN, process.env.NODE_ENV);
if (invalid.length) console.warn(`Ignoring invalid WEB_ORIGIN entries: ${invalid.join(', ')} (use full origins such as http://localhost:8000).`);
const allowedOrigins = new Set(origins);
const isAllowedOrigin = origin => !origin || allowedOrigins.has(origin);
const warnedOrigins = new Set();
function warnBlocked(origin) {
  if (warnedOrigins.has(origin)) return;
  warnedOrigins.add(origin);
  console.warn(`Blocked browser origin ${origin}. Add it to WEB_ORIGIN (comma-separated) in apps/api/.env and restart the API.`);
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
// The API is meant to be called from a different origin (the web app), so allow cross-origin reads of its responses.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    warnBlocked(origin);
    callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // CSRF protection for cookie-authenticated JSON endpoints. CLI requests without Origin remain possible.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !isAllowedOrigin(req.headers.origin)) {
    warnBlocked(req.headers.origin);
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  next();
});
const apiIndex = {
  name: 'Orbit API', ok: true,
  endpoints: ['POST /api/register', 'POST /api/login', 'POST /api/logout', 'GET /api/me', 'GET /api/health'],
  docs: 'docs/API.md'
};
app.get(['/', '/api'], (_req, res) => res.json(apiIndex));
app.use(sessionMiddleware);
app.get('/api/health', async (_req, res) => {
  try { await Promise.all([pool.query('SELECT 1'), redis.ping()]); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});
app.use('/api', routes);
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
  console.error('API error:', err);
  res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.status && err.status < 500 ? err.message : 'Something went wrong. Please try again.' });
});
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: origins, credentials: true },
  allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin)),
  maxHttpBufferSize: 1e5
});
// Engine.IO HTTP polling/upgrade both see the same Redis-backed login session.
io.engine.use(sessionMiddleware);
initializeSocket(io);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function withRetry(label, task, attempts = 15, delayMs = 2000) {
  for (let attempt = 1; ; attempt++) {
    try { return await task(); }
    catch (err) {
      if (attempt >= attempts) throw new Error(`${label} unreachable: ${err.code || err.message || 'unknown error'}`);
      console.warn(`${label} not ready (${err.code || err.message}); retrying ${attempt}/${attempts - 1}…`);
      await sleep(delayMs);
    }
  }
}

try {
  await Promise.race([redis.connect(), sleep(30_000).then(() => { throw new Error('Redis unreachable: timed out after 30s'); })]);
  await withRetry('PostgreSQL', () => pool.query('SELECT 1'));
  if (process.env.AUTO_MIGRATE !== '0') {
    const applied = await runMigrations(pool);
    console.log(applied.length ? `Database migrations applied: ${applied.join(', ')}` : 'Database schema is up to date.');
  }
  const port = Number(process.env.PORT || 4000);
  httpServer.listen(port, () => {
    console.log(`Orbit API listening on http://localhost:${port}`);
    console.log(`Allowed web origins: ${origins.join(', ')}`);
  });
} catch (err) {
  console.error('Startup failed:', err.message);
  await redis.quit().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
}
async function stop() {
  io.close();
  httpServer.close();
  await Promise.allSettled([redis.quit(), pool.end()]);
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
