import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { redis } from './redis.js';

export const cookieName = 'orbit.sid';
export const sessionMiddleware = session({
  store: new RedisStore({ client: redis, prefix: 'orbit:sess:' }),
  name: cookieName,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
});
export function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}
export async function establishSession(req, userId) {
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = userId;
  await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}
