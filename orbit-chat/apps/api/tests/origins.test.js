import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllowedOrigins, normalizeOrigin } from '../src/origins.js';

test('normalizes trailing slashes, paths and whitespace', () => {
  assert.equal(normalizeOrigin(' http://localhost:8000/ '), 'http://localhost:8000');
  assert.equal(normalizeOrigin('https://chat.example.com/app?x=1'), 'https://chat.example.com');
});
test('rejects wildcards and non-http values', () => {
  assert.equal(normalizeOrigin('*'), null);
  assert.equal(normalizeOrigin('localhost:8000'), null);
  assert.equal(normalizeOrigin('ftp://example.com'), null);
});
test('WEB_ORIGIN accepts a comma-separated list and reports invalid entries', () => {
  const { origins, invalid } = buildAllowedOrigins('http://localhost:8000, https://chat.example.com/ ,*', 'production');
  assert.deepEqual(origins, ['http://localhost:8000', 'https://chat.example.com']);
  assert.deepEqual(invalid, ['*']);
});
test('local dev frontends are allowed outside production only', () => {
  assert.ok(buildAllowedOrigins('http://localhost:5173', 'development').origins.includes('http://localhost:8000'));
  assert.ok(!buildAllowedOrigins('https://chat.example.com', 'production').origins.includes('http://localhost:8000'));
});
