import { z } from 'zod';

const name = z.string().trim().min(2).max(60);
const email = z.email().trim().toLowerCase().max(254);
const password = z.string().min(10).max(128).refine(value => Buffer.byteLength(value, 'utf8') <= 72, { message: 'Password is too long in UTF-8 bytes (maximum 72).' });
const uuid = z.uuid();
export const authRegister = z.object({ name, email, password });
export const authLogin = z.object({ email, password: z.string().min(1).max(128).refine(value => Buffer.byteLength(value, 'utf8') <= 72) });
export const profileUpdate = z.object({ name: name.optional(), bio: z.string().trim().max(180).optional(), status: z.string().trim().max(100).optional() }).refine((v) => Object.keys(v).length > 0);
export const conversationCreate = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('direct'), userId: uuid }),
  z.object({ kind: z.literal('group'), name: z.string().trim().min(2).max(80), userIds: z.array(uuid).min(2).max(30) })
]);
export const messageCreate = z.object({ body: z.string().trim().min(1).max(4000) });
export const reactionCreate = z.object({ emoji: z.enum(['❤️', '👍', '😂', '😮', '🎉', '🔥']) });
export const idParam = z.object({ id: uuid });
export const messageCursor = z.object({ before: z.uuid().optional() });
export function validate(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const err = new Error(result.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
    err.status = 400;
    throw err;
  }
  return result.data;
}
export function publicUser(row) {
  return { id: row.id, name: row.name, avatarColor: row.avatar_color, bio: row.bio, status: row.status, lastSeenAt: row.last_seen_at, createdAt: row.created_at };
}
export function uuidParam(value) { return validate(idParam, { id: value }).id; }
