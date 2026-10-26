import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { pool } from './database.js';
import { cookieName, establishSession, requireAuth } from './session.js';
import { authLogin, authRegister, conversationCreate, messageCreate, messageCursor, profileUpdate, publicUser, reactionCreate, uuidParam, validate } from './validation.js';
import { disconnectSession, emitToConversation, emitToUser, isOnline, notifyConversation, subscribeUserToConversation, unsubscribeUserFromConversation } from './socket.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });
const messageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, keyGenerator: req => req.session.userId, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'You are sending messages too quickly.' } });
const COLORS = ['#6C63E6', '#F38A79', '#42A99D', '#D39C4C', '#6588C4', '#AF7AB6'];
const userFields = 'id,name,email,avatar_color,bio,status,created_at,last_seen_at';
const wrap = (handler) => async (req, res, next) => { try { await handler(req, res, next); } catch (e) { next(e); } };
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
async function membership(conversationId, userId) {
  const { rows } = await pool.query('SELECT c.kind, c.name, cm.role FROM conversations c INNER JOIN conversation_members cm ON cm.conversation_id=c.id WHERE c.id=$1 AND cm.user_id=$2', [conversationId, userId]);
  if (!rows[0]) throw bad('Conversation not found.', 404);
  return rows[0];
}
function serializeMessage(row) {
  return { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, senderName: row.sender_name,
    senderAvatarColor: row.sender_avatar_color, body: row.deleted_at ? '' : row.body, createdAt: row.created_at,
    editedAt: row.edited_at, deletedAt: row.deleted_at, reactions: row.reactions ?? [] };
}
const messageColumns = `m.id, m.conversation_id, m.sender_id, m.body, m.created_at, m.edited_at, m.deleted_at,
 u.name AS sender_name, u.avatar_color AS sender_avatar_color,
 COALESCE((SELECT json_agg(json_build_object('emoji', r.emoji, 'userId', r.user_id)) FROM message_reactions r WHERE r.message_id=m.id), '[]'::json) AS reactions`;
async function fetchMessage(messageId) {
  const { rows } = await pool.query(`SELECT ${messageColumns} FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=$1`, [messageId]);
  return rows[0] ? serializeMessage(rows[0]) : null;
}
async function ensureMessageOwner(messageId, userId) {
  const { rows } = await pool.query(`SELECT m.* FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=$2 WHERE m.id=$1`, [messageId, userId]);
  if (!rows[0]) throw bad('Message not found.', 404);
  if (rows[0].sender_id !== userId) throw bad('You can only change your own messages.', 403);
  if (rows[0].deleted_at) throw bad('This message was deleted.', 409);
  return rows[0];
}

router.post('/auth/register', authLimiter, wrap(async (req, res) => {
  const { name, email, password } = validate(authRegister, req.body);
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(`INSERT INTO users(name,email,password_hash,avatar_color) VALUES($1,$2,$3,$4) RETURNING ${userFields}`, [name, email, hash, COLORS[Math.floor(Math.random() * COLORS.length)]]);
    await establishSession(req, rows[0].id);
    res.status(201).json({ user: { ...publicUser(rows[0]), email: rows[0].email } });
  } catch (e) {
    if (e.code === '23505') throw bad('That email address is already registered.', 409);
    throw e;
  }
}));

router.post('/auth/login', authLimiter, wrap(async (req, res) => {
  const { email, password } = validate(authLogin, req.body);
  const { rows } = await pool.query(`SELECT ${userFields},password_hash FROM users WHERE lower(email)=$1`, [email]);
  const user = rows[0];
  // Keep a password hash comparison on the missing-user path to reduce timing leaks.
  const match = await bcrypt.compare(password, user?.password_hash ?? '$2b$12$GqmkNHVti5RwQcDH4hqn4uK/B6OTcUszzPB47gBrDLst2P20d0ZSK');
  if (!user || !match) throw bad('Incorrect email or password.', 401);
  await establishSession(req, user.id);
  res.json({ user: { ...publicUser(user), email: user.email } });
}));
router.post('/auth/logout', requireAuth, wrap(async (req, res) => {
  const sessionId = req.sessionID;
  await new Promise((resolve, reject) => req.session.destroy(err => err ? reject(err) : resolve()));
  disconnectSession(sessionId);
  res.clearCookie(cookieName, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  res.status(204).end();
}));
router.get('/auth/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${userFields} FROM users WHERE id=$1`, [req.session.userId]);
  if (!rows[0]) return res.status(401).json({ error: 'Session user not found.' });
  res.json({ user: { ...publicUser(rows[0]), email: rows[0].email } });
}));
router.patch('/me', requireAuth, wrap(async (req, res) => {
  const updates = validate(profileUpdate, req.body);
  const { rows } = await pool.query(`UPDATE users SET name=COALESCE($2,name),bio=COALESCE($3,bio),status=COALESCE($4,status) WHERE id=$1 RETURNING ${userFields}`,
    [req.session.userId, updates.name ?? null, updates.bio ?? null, updates.status ?? null]);
  if (!rows[0]) throw bad('User not found.', 404);
  const user = { ...publicUser(rows[0]), email: rows[0].email };
  emitToUser(user.id, 'profile:updated', user);
  const { rows: contacts } = await pool.query(`SELECT DISTINCT other.user_id FROM conversation_members own
    JOIN conversation_members other ON own.conversation_id=other.conversation_id
    WHERE own.user_id=$1 AND other.user_id<>$1`, [user.id]);
  for (const contact of contacts) emitToUser(contact.user_id, 'profile:changed', { userId: user.id });
  res.json({ user });
}));
router.get('/users', requireAuth, wrap(async (req, res) => {
  const q = String(req.query.search ?? '').trim().slice(0, 80);
  // Escape SQL LIKE wildcards; a search cannot cause a full wildcard match unexpectedly.
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows } = await pool.query(`SELECT id,name,avatar_color,bio,status,last_seen_at FROM users
     WHERE id<>$1 AND (name ILIKE $2 ESCAPE '\\' OR email ILIKE $2 ESCAPE '\\') ORDER BY name LIMIT 30`, [req.session.userId, pattern]);
  res.json({ users: rows.map(u => ({ ...publicUser(u), online: isOnline(u.id) })) });
}));

router.get('/conversations', requireAuth, wrap(async (req, res) => {
  const uid = req.session.userId;
  const { rows } = await pool.query(`SELECT c.id,c.kind,c.name,c.created_by,c.created_at,c.updated_at,
    cm.role, cm.last_read_at,
    (SELECT row_to_json(last) FROM (SELECT m.id,m.sender_id,m.body,m.deleted_at,m.created_at,u.name AS sender_name
      FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) last) AS last_message,
    (SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1 AND m.deleted_at IS NULL AND m.created_at > cm.last_read_at) AS unread_count
    FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id
    WHERE cm.user_id=$1 ORDER BY c.updated_at DESC LIMIT 75`, [uid]);
  if (!rows.length) return res.json({ conversations: [] });
  const ids = rows.map(c => c.id);
  const { rows: memberRows } = await pool.query(`SELECT cm.conversation_id,cm.role,cm.last_read_at,u.id,u.name,u.avatar_color,u.bio,u.status,u.last_seen_at
    FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=ANY($1::uuid[]) ORDER BY cm.joined_at`, [ids]);
  const members = new Map();
  for (const m of memberRows) {
    if (!members.has(m.conversation_id)) members.set(m.conversation_id, []);
    members.get(m.conversation_id).push({ ...publicUser(m), role: m.role, lastReadAt: m.last_read_at, online: isOnline(m.id) });
  }
  res.json({ conversations: rows.map(c => ({ id:c.id, kind:c.kind, name:c.name, createdBy:c.created_by, createdAt:c.created_at, updatedAt:c.updated_at,
    role:c.role, lastReadAt:c.last_read_at, unreadCount:c.unread_count,
    lastMessage:c.last_message && { id:c.last_message.id, senderId:c.last_message.sender_id, senderName:c.last_message.sender_name,
      body:c.last_message.deleted_at ? 'Message deleted' : c.last_message.body, createdAt:c.last_message.created_at }, members:members.get(c.id) ?? [] })) });
}));

router.post('/conversations', requireAuth, wrap(async (req, res) => {
  const input = validate(conversationCreate, req.body);
  const uid = req.session.userId;
  const client = await pool.connect();
  let conversationId;
  let memberIds;
  try {
    await client.query('BEGIN');
    if (input.kind === 'direct') {
      if (input.userId === uid) throw bad('You cannot message yourself.');
      const { rowCount } = await client.query('SELECT 1 FROM users WHERE id=$1', [input.userId]);
      if (!rowCount) throw bad('User not found.', 404);
      const key = [uid, input.userId].sort().join(':');
      const { rows } = await client.query(`INSERT INTO conversations(kind,direct_key,created_by) VALUES('direct',$1,$2)
        ON CONFLICT (direct_key) DO UPDATE SET direct_key=EXCLUDED.direct_key RETURNING id`, [key, uid]);
      conversationId = rows[0].id;
      memberIds = [uid, input.userId];
    } else {
      memberIds = [...new Set([uid, ...input.userIds])];
      if (memberIds.length < 3) throw bad('Choose at least two other members for a group.');
      const { rows: found } = await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[])', [memberIds]);
      if (found.length !== memberIds.length) throw bad('One of those users was not found.', 404);
      const { rows } = await client.query(`INSERT INTO conversations(kind,name,created_by) VALUES('group',$1,$2) RETURNING id`, [input.name, uid]);
      conversationId = rows[0].id;
    }
    for (const id of memberIds) {
      await client.query(`INSERT INTO conversation_members(conversation_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
        [conversationId, id, id === uid ? 'owner' : 'member']);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  for (const id of memberIds) {
    subscribeUserToConversation(id, conversationId);
    emitToUser(id, 'conversation:created', { conversationId });
  }
  res.status(201).json({ conversationId });
}));

router.get('/conversations/:id/messages', requireAuth, wrap(async (req, res) => {
  const id = uuidParam(req.params.id);
  await membership(id, req.session.userId);
  const { before } = validate(messageCursor, req.query);
  const { rows } = await pool.query(`SELECT ${messageColumns} FROM messages m JOIN users u ON u.id=m.sender_id
     WHERE m.conversation_id=$1 AND ($2::uuid IS NULL OR (m.created_at, m.id) <
       (SELECT cursor.created_at, cursor.id FROM messages cursor WHERE cursor.conversation_id=$1 AND cursor.id=$2::uuid))
     ORDER BY m.created_at DESC, m.id DESC LIMIT 41`, [id, before ?? null]);
  res.json({ messages: rows.slice(0, 40).reverse().map(serializeMessage), hasMore: rows.length > 40 });
}));

router.post('/conversations/:id/messages', requireAuth, messageLimiter, wrap(async (req, res) => {
  const id = uuidParam(req.params.id);
  const { body } = validate(messageCreate, req.body);
  await membership(id, req.session.userId);
  const client = await pool.connect();
  let messageId;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,$3) RETURNING id`, [id, req.session.userId, body]);
    messageId = rows[0].id;
    await client.query('UPDATE conversations SET updated_at=now() WHERE id=$1', [id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  const message = await fetchMessage(messageId);
  emitToConversation(id, 'message:new', message);
  await notifyConversation(id, 'conversation:updated', { conversationId: id }).catch(err => console.error('Conversation notification:', err.message));
  res.status(201).json({ message });
}));
router.post('/conversations/:id/read', requireAuth, wrap(async (req, res) => {
  const id = uuidParam(req.params.id);
  await membership(id, req.session.userId);
  const { rows } = await pool.query(`UPDATE conversation_members SET last_read_at=now()
    WHERE conversation_id=$1 AND user_id=$2 RETURNING last_read_at`, [id, req.session.userId]);
  emitToConversation(id, 'conversation:read', { conversationId: id, userId: req.session.userId, lastReadAt: rows[0].last_read_at });
  emitToUser(req.session.userId, 'conversation:updated', { conversationId: id });
  res.json({ lastReadAt: rows[0].last_read_at });
}));
router.patch('/messages/:id', requireAuth, wrap(async (req, res) => {
  const id = uuidParam(req.params.id);
  const { body } = validate(messageCreate, req.body);
  const owned = await ensureMessageOwner(id, req.session.userId);
  await pool.query('UPDATE messages SET body=$2,edited_at=now() WHERE id=$1', [id, body]);
  const message = await fetchMessage(id);
  emitToConversation(owned.conversation_id, 'message:updated', message);
  await notifyConversation(owned.conversation_id, 'conversation:updated', { conversationId: owned.conversation_id });
  res.json({ message });
}));
router.delete('/messages/:id', requireAuth, wrap(async (req, res) => {
  const id = uuidParam(req.params.id);
  const owned = await ensureMessageOwner(id, req.session.userId);
  await pool.query(`UPDATE messages SET deleted_at=now(),body='' WHERE id=$1`, [id]);
  const message = await fetchMessage(id);
  emitToConversation(owned.conversation_id, 'message:updated', message);
  await notifyConversation(owned.conversation_id, 'conversation:updated', { conversationId: owned.conversation_id });
  res.json({ message });
}));
router.post('/messages/:id/reactions', requireAuth, wrap(async (req, res) => {
  const id = uuidParam(req.params.id);
  const { emoji } = validate(reactionCreate, req.body);
  const { rows } = await pool.query(`SELECT m.conversation_id,m.deleted_at FROM messages m JOIN conversation_members cm
    ON cm.conversation_id=m.conversation_id AND cm.user_id=$2 WHERE m.id=$1`, [id, req.session.userId]);
  if (!rows[0]) throw bad('Message not found.', 404);
  if (rows[0].deleted_at) throw bad('Cannot react to a deleted message.', 409);
  const deleted = await pool.query('DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3', [id, req.session.userId, emoji]);
  if (!deleted.rowCount) await pool.query('INSERT INTO message_reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [id, req.session.userId, emoji]);
  const message = await fetchMessage(id);
  emitToConversation(rows[0].conversation_id, 'message:updated', message);
  res.json({ message });
}));
router.delete('/conversations/:id/members/me', requireAuth, wrap(async (req, res) => {
  const id = uuidParam(req.params.id);
  const uid = req.session.userId;
  const client = await pool.connect();
  let others = [];
  try {
    await client.query('BEGIN');
    const { rows: conv } = await client.query('SELECT kind FROM conversations WHERE id=$1 FOR UPDATE', [id]);
    if (conv[0]?.kind !== 'group') throw bad('Group not found.', 404);
    const { rows: all } = await client.query('SELECT user_id,role FROM conversation_members WHERE conversation_id=$1 ORDER BY joined_at', [id]);
    if (!all.some(m => m.user_id === uid)) throw bad('Group not found.', 404);
    others = all.filter(m => m.user_id !== uid).map(m => m.user_id);
    if (all.find(m => m.user_id === uid).role === 'owner' && others.length) {
      await client.query(`UPDATE conversation_members SET role='owner' WHERE conversation_id=$1 AND user_id=$2`, [id, others[0]]);
    }
    await client.query('DELETE FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [id, uid]);
    if (!others.length) await client.query('DELETE FROM conversations WHERE id=$1', [id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  unsubscribeUserFromConversation(uid, id);
  emitToUser(uid, 'conversation:removed', { conversationId: id });
  for (const otherId of others) emitToUser(otherId, 'conversation:updated', { conversationId: id });
  res.status(204).end();
}));

export default router;
