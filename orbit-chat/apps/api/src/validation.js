import { z } from 'zod';

const name = z.string({ error: 'Name is required.' }).trim().min(2, 'Name must be at least 2 characters.').max(60, 'Name can be at most 60 characters.');
// Trim and lowercase first, then check the format, so " Ada@Example.com " is accepted.
const email = z.string({ error: 'Email is required.' }).trim().toLowerCase().max(254, 'Email is too long.').pipe(z.email('Enter a valid email address.'));
const password = z.string({ error: 'Password is required.' }).min(10, 'Password must be at least 10 characters.').max(128, 'Password can be at most 128 characters.').refine(value => Buffer.byteLength(value, 'utf8') <= 72, { message: 'Password is too long in UTF-8 bytes (maximum 72).' });
const uuid = z.uuid('Invalid id.');
export const authRegister = z.object({ name, email, password });
export const authLogin = z.object({ email, password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(128, 'Password is too long.').refine(value => Buffer.byteLength(value, 'utf8') <= 72, { message: 'Incorrect email or password.' }) });
export const profileUpdate = z.object({ name: name.optional(), bio: z.string().trim().max(180, 'Bio can be at most 180 characters.').optional(), status: z.string().trim().max(100, 'Status can be at most 100 characters.').optional() }).refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });
export const conversationCreate = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('direct'), userId: uuid }),
  z.object({ kind: z.literal('group'), name: z.string().trim().min(2, 'Group name must be at least 2 characters.').max(80, 'Group name can be at most 80 characters.'), userIds: z.array(uuid).min(2, 'Choose at least two other members for a group.').max(30, 'A group can have at most 30 other members.') })
], { error: 'Conversation kind must be "direct" or "group".' });
export const messageCreate = z.object({ body: z.string({ error: 'Message is required.' }).trim().min(1, 'Message cannot be empty.').max(4000, 'Message can be at most 4000 characters.') });
export const reactionCreate = z.object({ emoji: z.enum(['❤️', '👍', '😂', '😮', '🎉', '🔥'], { error: 'Unsupported reaction.' }) });
export const idParam = z.object({ id: uuid });
export const messageCursor = z.object({ before: z.uuid('Invalid cursor.').optional() });
export function validate(schema, input) {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const err = new Error([...new Set(result.error.issues.map(i => i.message))].join(' '));
    err.status = 400;
    throw err;
  }
  return result.data;
}
export function publicUser(row) {
  return { id: row.id, name: row.name, avatarColor: row.avatar_color, bio: row.bio, status: row.status, lastSeenAt: row.last_seen_at, createdAt: row.created_at };
}
export function uuidParam(value) { return validate(idParam, { id: value }).id; }
