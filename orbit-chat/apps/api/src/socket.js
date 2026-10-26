import { pool } from './database.js';
import { redis } from './redis.js';

let ioInstance;
const activeUsers = new Map();
const typingThrottle = new Map();
export function disconnectSession(sessionId) { ioInstance?.in(`session:${sessionId}`).disconnectSockets(true); }
export const isOnline = userId => (activeUsers.get(userId)?.size ?? 0) > 0;
export function emitToConversation(id, event, payload) { ioInstance?.to(`conversation:${id}`).emit(event, payload); }
export function emitToUser(id, event, payload) { ioInstance?.to(`user:${id}`).emit(event, payload); }
export function subscribeUserToConversation(userId, conversationId) { ioInstance?.in(`user:${userId}`).socketsJoin(`conversation:${conversationId}`); }
export function unsubscribeUserFromConversation(userId, conversationId) { ioInstance?.in(`user:${userId}`).socketsLeave(`conversation:${conversationId}`); }
export async function notifyConversation(conversationId, event, payload) {
  const { rows } = await pool.query('SELECT user_id FROM conversation_members WHERE conversation_id=$1', [conversationId]);
  for (const row of rows) emitToUser(row.user_id, event, payload);
}
export function initializeSocket(io) {
  ioInstance = io;
  io.use((socket, next) => {
    const id = socket.request.session?.userId;
    if (!id) return next(new Error('Unauthorized'));
    socket.data.userId = id;
    next();
  });
  io.on('connection', async (socket) => {
    const uid = socket.data.userId;
    socket.join(`user:${uid}`);
    socket.join(`session:${socket.request.sessionID}`);
    // Expired/revoked Redis login sessions must not leave an authenticated socket running forever.
    const sessionCheck = setInterval(async () => {
      try { if (!(await redis.exists(`orbit:sess:${socket.request.sessionID}`))) socket.disconnect(true); }
      catch { socket.disconnect(true); }
    }, 60_000);
    sessionCheck.unref?.();
    let previouslyJoinedRooms = [];
    const peers = activeUsers.get(uid) || new Set();
    const wasOffline = peers.size === 0;
    peers.add(socket.id);
    activeUsers.set(uid, peers);
    try {
      const { rows } = await pool.query('SELECT conversation_id FROM conversation_members WHERE user_id=$1', [uid]);
      for (const row of rows) socket.join(`conversation:${row.conversation_id}`);
      previouslyJoinedRooms = rows.map(row => `conversation:${row.conversation_id}`);
    } catch (err) { console.error('Socket room initialization:', err.message); }
    if (wasOffline && previouslyJoinedRooms.length) io.to(previouslyJoinedRooms).emit('presence:changed', { userId: uid, online: true });

    socket.on('conversation:join', async (conversationId) => {
      if (typeof conversationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(conversationId)) return;
      try {
        const { rowCount } = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [conversationId, uid]);
        if (rowCount) socket.join(`conversation:${conversationId}`);
      } catch { /* invalid or unavailable conversation; do not join */ }
    });
    socket.on('typing:set', async ({ conversationId, typing } = {}) => {
      if (typeof conversationId !== 'string' || typeof typing !== 'boolean') return;
      const key = `${socket.id}:${conversationId}`;
      if (Date.now() - (typingThrottle.get(key) ?? 0) < 350) return;
      typingThrottle.set(key, Date.now());
      // Never trust room membership alone: membership might have been revoked.
      try {
        const { rowCount } = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [conversationId, uid]);
        if (rowCount) socket.to(`conversation:${conversationId}`).emit('typing:changed', { conversationId, userId: uid, typing });
      } catch { /* ignore malformed IDs */ }
    });
    socket.on('disconnecting', () => { previouslyJoinedRooms = [...socket.rooms].filter(room => room.startsWith('conversation:')); });
    socket.on('disconnect', async () => {
      clearInterval(sessionCheck);
      for (const key of typingThrottle.keys()) if (key.startsWith(`${socket.id}:`)) typingThrottle.delete(key);
      const current = activeUsers.get(uid);
      current?.delete(socket.id);
      if (!current?.size) {
        activeUsers.delete(uid);
        if (previouslyJoinedRooms.length) io.to(previouslyJoinedRooms).emit('presence:changed', { userId: uid, online: false, lastSeenAt: new Date().toISOString() });
        try { await pool.query('UPDATE users SET last_seen_at=now() WHERE id=$1', [uid]); } catch (err) { console.error('Last seen update:', err.message); }
      }
    });
  });
}
