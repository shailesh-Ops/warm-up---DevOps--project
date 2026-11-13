import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRedisConfig, buildHttpsConfig, isHttpsEnabled, redirectLocation, envFlag, explainRedisTlsError } from '../src/tls.js';

// The builders only read file contents, so placeholder PEM text is enough here (real certs are used in the live test).
const dir = mkdtempSync(join(tmpdir(), 'orbit-tls-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const file = (name, body = `-----BEGIN TEST-----\n${name}\n-----END TEST-----\n`) => {
  const p = join(dir, name);
  writeFileSync(p, body);
  return p;
};
const ca = file('ca.crt');
const clientCert = file('client.crt');
const clientKey = file('client.key');

test('envFlag understands common spellings and falls back otherwise', () => {
  assert.equal(envFlag('TRUE', false), true);
  assert.equal(envFlag(' 0 ', true), false);
  assert.equal(envFlag('', true), true);
  assert.equal(envFlag('maybe', false), false);
});

// ---------- Redis ----------
test('redis: REDIS_URL is required and must be redis:// or rediss://', () => {
  assert.throws(() => buildRedisConfig({}), /REDIS_URL is required/);
  assert.throws(() => buildRedisConfig({ REDIS_URL: 'not a url' }), /valid redis/);
  assert.throws(() => buildRedisConfig({ REDIS_URL: 'http://redis:6379' }), /protocol/);
});

test('redis: plain redis:// has no TLS settings', () => {
  const c = buildRedisConfig({ REDIS_URL: 'redis://:pw@localhost:6379' });
  assert.equal(c.useTls, false);
  assert.equal(c.options.socket.tls, undefined);
  assert.equal(typeof c.options.socket.reconnectStrategy, 'function');
});

test('redis: rediss:// loads the CA (either variable name) and verifies the server by default', () => {
  for (const name of ['REDIS_TLS_CA_CERT_PATH', 'REDIS_TLS_CA_PATH']) {
    const c = buildRedisConfig({ REDIS_URL: 'rediss://:pw@redis:6379', [name]: ca });
    assert.equal(c.useTls, true);
    assert.equal(c.options.socket.tls, true);
    assert.ok(Buffer.isBuffer(c.options.socket.ca));
    assert.equal(c.options.socket.rejectUnauthorized, true);
    assert.equal(c.mutualTls, false);
  }
});

test('redis: mTLS needs both client certificate and key', () => {
  const base = { REDIS_URL: 'rediss://:pw@redis:6379', REDIS_TLS_CA_CERT_PATH: ca };
  assert.throws(() => buildRedisConfig({ ...base, REDIS_TLS_CLIENT_CERT_PATH: clientCert }), /both/);
  assert.throws(() => buildRedisConfig({ ...base, REDIS_TLS_CLIENT_KEY_PATH: clientKey }), /both/);
  const c = buildRedisConfig({ ...base, REDIS_TLS_CLIENT_CERT_PATH: clientCert, REDIS_TLS_CLIENT_KEY_PATH: clientKey });
  assert.equal(c.mutualTls, true);
  assert.ok(c.options.socket.cert && c.options.socket.key);
});

test('redis: certificate settings with a plain redis:// URL are rejected instead of silently ignored', () => {
  assert.throws(() => buildRedisConfig({ REDIS_URL: 'redis://redis:6379', REDIS_TLS_CA_CERT_PATH: ca }), /rediss:\/\//);
});

test('redis: an unreadable certificate path names the variable', () => {
  assert.throws(
    () => buildRedisConfig({ REDIS_URL: 'rediss://redis:6379', REDIS_TLS_CA_CERT_PATH: join(dir, 'missing.crt') }),
    /REDIS_TLS_CA_CERT_PATH.*cannot be read/
  );
});

test('redis: disabling verification works in development but never in production', () => {
  const env = { REDIS_URL: 'rediss://redis:6379', REDIS_TLS_REJECT_UNAUTHORIZED: 'false' };
  assert.equal(buildRedisConfig({ ...env, NODE_ENV: 'development' }).options.socket.rejectUnauthorized, false);
  assert.throws(() => buildRedisConfig({ ...env, NODE_ENV: 'production' }), /not allowed in production/);
});

test('redis: password is hidden in displayUrl and REDIS_PASSWORD is only a fallback', () => {
  const c = buildRedisConfig({ REDIS_URL: 'rediss://:s3cret@redis:6379' });
  assert.ok(!c.displayUrl.includes('s3cret'));
  assert.equal(c.options.password, undefined);
  const d = buildRedisConfig({ REDIS_URL: 'rediss://redis:6379', REDIS_PASSWORD: 'fromenv' });
  assert.equal(d.options.password, 'fromenv');
});

test('redis: REDIS_TLS_SERVERNAME is passed through for SNI/verification', () => {
  const c = buildRedisConfig({ REDIS_URL: 'rediss://127.0.0.1:6379', REDIS_TLS_SERVERNAME: 'redis' });
  assert.equal(c.options.socket.servername, 'redis');
});

// ---------- HTTPS ----------
test('https: off by default, on when key and cert are set, HTTPS_ENABLED can override', () => {
  assert.equal(buildHttpsConfig({}), null);
  assert.equal(isHttpsEnabled({}), false);
  const key = file('api.key');
  const cert = file('api.crt');
  const c = buildHttpsConfig({ HTTPS_KEY_PATH: key, HTTPS_CERT_PATH: cert });
  assert.ok(Buffer.isBuffer(c.key) && Buffer.isBuffer(c.cert));
  assert.equal(c.minVersion, 'TLSv1.2');
  assert.equal(buildHttpsConfig({ HTTPS_KEY_PATH: key, HTTPS_CERT_PATH: cert, HTTPS_ENABLED: '0' }), null);
});

test('https: a half-configured setup fails loudly', () => {
  assert.throws(() => buildHttpsConfig({ HTTPS_ENABLED: '1' }), /HTTPS_KEY_PATH and HTTPS_CERT_PATH/);
  assert.throws(() => buildHttpsConfig({ HTTPS_ENABLED: '1', HTTPS_KEY_PATH: file('only.key') }), /HTTPS_KEY_PATH and HTTPS_CERT_PATH/);
  assert.throws(() => buildHttpsConfig({ HTTPS_KEY_PATH: join(dir, 'nope.key'), HTTPS_CERT_PATH: join(dir, 'nope.crt') }), /HTTPS_KEY_PATH.*cannot be read/);
});

test('https: minimum TLS version is validated; passphrase and extra CA are optional', () => {
  const env = { HTTPS_KEY_PATH: file('k2.key'), HTTPS_CERT_PATH: file('c2.crt') };
  assert.throws(() => buildHttpsConfig({ ...env, HTTPS_MIN_VERSION: 'TLSv1.0' }), /TLSv1\.2 or TLSv1\.3/);
  const c = buildHttpsConfig({ ...env, HTTPS_MIN_VERSION: 'TLSv1.3', HTTPS_PASSPHRASE: 'pp', HTTPS_CA_PATH: ca });
  assert.equal(c.minVersion, 'TLSv1.3');
  assert.equal(c.passphrase, 'pp');
  assert.ok(c.ca);
});

test('redirect: keeps only the path of the request and the configured public origin', () => {
  assert.equal(redirectLocation('https://api.example.com:4000/ignored', '/api/me?x=1'), 'https://api.example.com:4000/api/me?x=1');
  // Absolute-form and protocol-relative request targets must not be able to choose the destination.
  assert.equal(redirectLocation('https://api.example.com', 'http://evil.example/x'), 'https://api.example.com/');
  assert.equal(redirectLocation('https://api.example.com', '//evil.example/x'), 'https://api.example.com/');
});

test('startup errors that retrying cannot fix are explained, temporary ones are not', () => {
  const untrusted = Object.assign(new Error('self-signed certificate in certificate chain'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' });
  assert.match(explainRedisTlsError(untrusted), /REDIS_TLS_CA_CERT_PATH/);
  const mismatch = Object.assign(new Error('Hostname/IP does not match certificate\'s altnames'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  assert.match(explainRedisTlsError(mismatch), /REDIS_TLS_SERVERNAME/);
  const needsClientCert = new Error('error:0A00045C:SSL routines:ssl3_read_bytes:tlsv13 alert certificate required');
  assert.match(explainRedisTlsError(needsClientCert), /REDIS_TLS_CLIENT_CERT_PATH/);
  assert.equal(explainRedisTlsError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })), null);
  assert.equal(explainRedisTlsError(undefined), null);
});
