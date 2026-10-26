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
import routes from './routes.js';

const { DATABASE_URL, REDIS_URL, SESSION_SECRET, WEB_ORIGIN } = process.env;
if (!DATABASE_URL || !REDIS_URL || !SESSION_SECRET || SESSION_SECRET.length < 32 || SESSION_SECRET.startsWith('replace-with-') || !WEB_ORIGIN) {
  console.error('Set DATABASE_URL, REDIS_URL, WEB_ORIGIN and a SESSION_SECRET of at least 32 characters. See .env.example.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
const origins = WEB_ORIGIN.split(',').map(s => s.trim());
app.use(helmet());
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // CSRF protection for cookie-authenticated JSON endpoints. CLI requests without Origin remain possible.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin && !origins.includes(req.headers.origin)) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  next();
});
app.use(sessionMiddleware);
app.get('/api/health', async (_req, res) => {
  try { await Promise.all([pool.query('SELECT 1'), redis.ping()]); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});
app.use('/api', routes);
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  console.error('API error:', err);
  res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.status && err.status < 500 ? err.message : 'Something went wrong. Please try again.' });
});
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: origins, credentials: true },
  allowRequest: (req, callback) => callback(null, !req.headers.origin || origins.includes(req.headers.origin)),
  maxHttpBufferSize: 1e5
});
// Engine.IO HTTP polling/upgrade both see the same Redis-backed login session.
io.engine.use(sessionMiddleware);
initializeSocket(io);

try {
  await redis.connect();
  await pool.query('SELECT 1');
  const port = Number(process.env.PORT || 4000);
  httpServer.listen(port, () => console.log(`Orbit API listening on http://localhost:${port}`));
} catch (err) {
  console.error('Startup failed:', err.message);
  await redis.quit().catch(() => {});
  await pool.end();
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
