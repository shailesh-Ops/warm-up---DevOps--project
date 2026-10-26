import test from 'node:test';
import assert from 'node:assert/strict';
import { authRegister, messageCreate, conversationCreate, reactionCreate, validate } from '../src/validation.js';
test('validates registration and normalizes email', () => {
  const data = validate(authRegister, { name:' Ada ', email:'ADA@Example.COM', password:'correct-horse-battery' });
  assert.equal(data.email, 'ada@example.com');
  assert.equal(data.name, 'Ada');
});
test('blocks short passwords', () => {
  assert.throws(() => validate(authRegister, { name:'Ada', email:'ada@example.com', password:'123' }));
});
test('blocks empty and oversized messages', () => {
  assert.throws(() => validate(messageCreate, { body:'   ' }));
  assert.throws(() => validate(messageCreate, { body:'a'.repeat(4001) }));
});
test('rejects invalid conversation kind and insufficient group members', () => {
  assert.throws(() => validate(conversationCreate, { kind:'public' }));
  assert.throws(() => validate(conversationCreate, { kind:'group', name:'Hey', userIds:[] }));
});
test('only approved reactions are allowed', () => {
  assert.equal(validate(reactionCreate, { emoji:'🔥' }).emoji, '🔥');
  assert.throws(() => validate(reactionCreate, { emoji:'some arbitrary string' }));
});
