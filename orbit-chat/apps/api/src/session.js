import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { redis } from './redis.js';

export const cookieName = 'orbit.sid';

// COOKIE_SECURE=1 always sets the Secure flag, 0 never does, and "auto" (default) sets it only when the
// request really arrived over HTTPS (set TRUST_PROXY=1 behind a TLS proxy). A hard-coded `secure: true`
// in production silently drops the cookie on plain-HTTP setups, which looks like "login does nothing".
const secureSetting = { '1': true, 'true': true, '0': false, 'false': false }[String(process.env.COOKIE_SECURE ?? '').toLowerCase()] ?? 'auto';
const baseCookie = { httpOnly: true, secure: secureSetting, sameSite: 'lax', path: '/' };

export const sessionMiddleware = session({
  store: new RedisStore({ client: redis, prefix: 'orbit:sess:' }),
  name: cookieName,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { ...baseCookie, maxAge: 1000 * 60 * 60 * 24 * 7 }
});
export const clearCookieOptions = req => ({ ...baseCookie, secure: secureSetting === 'auto' ? Boolean(req.secure) : secureSetting });
export function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}
export async function establishSession(req, userId) {
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = userId;
  await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}
