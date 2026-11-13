// TLS configuration helpers for the API.
//   * buildRedisConfig()  -> options for the node-redis client (redis:// or rediss://, optional mTLS)
//   * buildHttpsConfig()  -> options for node:https, or null when the API should serve plain HTTP
// They only read env vars + certificate files and return plain objects, so they are easy to unit test.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

/** Parse "1/true/yes/on" and "0/false/no/off". Empty or unknown values give `fallback`. */
export function envFlag(value, fallback) {
  const v = String(value ?? '').trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return fallback;
}

/** Read a PEM file whose path is in the first env var (of `names`) that is set. Errors name the variable. */
function readPem(env, names) {
  for (const name of names) {
    const raw = env[name]?.trim();
    if (!raw) continue;
    const filePath = resolve(raw);
    try {
      return readFileSync(filePath);
    } catch (err) {
      throw new Error(`${name} points to a file that cannot be read (${filePath}): ${err.code || err.message}`);
    }
  }
  return undefined;
}

/** Same URL without the credentials, safe to print in logs. */
function redact(url) {
  const copy = new URL(url.href);
  copy.username = '';
  copy.password = '';
  return copy.href;
}

/**
 * Redis client settings.
 *   REDIS_URL                      redis://… or rediss://:password@host:6379 (required)
 *   REDIS_PASSWORD                 used only when the URL has no password
 *   REDIS_TLS_CA_CERT_PATH         CA that signed the Redis server certificate (REDIS_TLS_CA_PATH also accepted)
 *   REDIS_TLS_CLIENT_CERT_PATH     optional mTLS client certificate (needs the key too)
 *   REDIS_TLS_CLIENT_KEY_PATH      optional mTLS client key
 *   REDIS_TLS_SERVERNAME           optional name to verify the server certificate against (when it differs from the URL host)
 *   REDIS_TLS_REJECT_UNAUTHORIZED  default true; false disables certificate verification (refused in production)
 */
export function buildRedisConfig(env = process.env) {
  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) throw new Error('REDIS_URL is required');

  let url;
  try {
    url = new URL(redisUrl);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
  }
  const useTls = url.protocol === 'rediss:';
  if (!useTls && url.protocol !== 'redis:') throw new Error('REDIS_URL protocol must be redis:// or rediss://');

  const ca = readPem(env, ['REDIS_TLS_CA_CERT_PATH', 'REDIS_TLS_CA_PATH']);
  const cert = readPem(env, ['REDIS_TLS_CLIENT_CERT_PATH']);
  const key = readPem(env, ['REDIS_TLS_CLIENT_KEY_PATH']);
  const servername = env.REDIS_TLS_SERVERNAME?.trim() || undefined;

  if (Boolean(cert) !== Boolean(key)) {
    throw new Error('Redis mTLS requires both REDIS_TLS_CLIENT_CERT_PATH and REDIS_TLS_CLIENT_KEY_PATH');
  }
  if ((ca || cert || key || servername) && !useTls) {
    throw new Error('Redis TLS certificate settings require REDIS_URL to use rediss://');
  }

  const rejectUnauthorized = envFlag(env.REDIS_TLS_REJECT_UNAUTHORIZED, true);
  if (useTls && !rejectUnauthorized && env.NODE_ENV === 'production') {
    throw new Error('REDIS_TLS_REJECT_UNAUTHORIZED=false is not allowed in production; provide REDIS_TLS_CA_CERT_PATH instead');
  }

  const reconnectStrategy = retries => Math.min(retries * 150, 2500);
  const socket = useTls
    ? { tls: true, ...(ca && { ca }), ...(cert && { cert }), ...(key && { key }), ...(servername && { servername }), rejectUnauthorized, reconnectStrategy }
    : { reconnectStrategy };

  return {
    useTls,
    mutualTls: Boolean(cert && key),
    displayUrl: redact(url),
    options: {
      url: redisUrl,
      ...(!url.password && env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
      socket
    }
  };
}

/** True when the API should serve HTTPS: explicit HTTPS_ENABLED wins, otherwise both key and cert paths must be set. */
export function isHttpsEnabled(env = process.env) {
  return envFlag(env.HTTPS_ENABLED, Boolean(env.HTTPS_KEY_PATH?.trim() && env.HTTPS_CERT_PATH?.trim()));
}

/**
 * HTTPS settings for the API server. Returns null when HTTPS is off (plain HTTP).
 *   HTTPS_KEY_PATH / HTTPS_CERT_PATH   PEM private key + certificate (full chain). Setting both turns HTTPS on.
 *   HTTPS_ENABLED                      1 forces HTTPS (and requires the two paths), 0 forces HTTP even if paths are set
 *   HTTPS_CA_PATH                      optional extra CA / intermediate chain
 *   HTTPS_PASSPHRASE                   optional passphrase for an encrypted key
 *   HTTPS_MIN_VERSION                  TLSv1.2 (default) or TLSv1.3
 */
export function buildHttpsConfig(env = process.env) {
  if (!isHttpsEnabled(env)) return null;
  const keyPath = env.HTTPS_KEY_PATH?.trim();
  const certPath = env.HTTPS_CERT_PATH?.trim();

  if (!keyPath || !certPath) {
    throw new Error('HTTPS needs both HTTPS_KEY_PATH and HTTPS_CERT_PATH');
  }
  const minVersion = env.HTTPS_MIN_VERSION?.trim() || 'TLSv1.2';
  if (!['TLSv1.2', 'TLSv1.3'].includes(minVersion)) {
    throw new Error('HTTPS_MIN_VERSION must be TLSv1.2 or TLSv1.3');
  }

  const ca = readPem(env, ['HTTPS_CA_PATH']);
  return {
    key: readPem(env, ['HTTPS_KEY_PATH']),
    cert: readPem(env, ['HTTPS_CERT_PATH']),
    ...(ca && { ca }),
    ...(env.HTTPS_PASSPHRASE && { passphrase: env.HTTPS_PASSPHRASE }),
    minVersion
  };
}

/**
 * Where the optional plain-HTTP listener sends people. Only the path of the incoming request is kept; the host
 * comes from the configured PUBLIC_URL, never from the Host header, so it cannot be turned into an open redirect.
 */
export function redirectLocation(publicUrl, requestUrl) {
  const base = new URL(publicUrl);
  const path = typeof requestUrl === 'string' && /^\/(?!\/)/.test(requestUrl) ? requestUrl : '/';
  return `${base.origin}${path}`;
}

const CERTIFICATE_ERROR_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID',
  'CERT_UNTRUSTED', 'ERR_TLS_CERT_ALTNAME_INVALID'
]);

/**
 * Turns a Redis TLS error that retrying can never fix into a readable explanation, or returns null for errors
 * that may be temporary (connection refused, reset, timeout...). Used to fail fast at startup.
 */
export function explainRedisTlsError(err) {
  if (CERTIFICATE_ERROR_CODES.has(err?.code)) {
    return `Redis TLS certificate rejected (${err.message}). Check REDIS_TLS_CA_CERT_PATH and that the certificate covers the host in REDIS_URL (or set REDIS_TLS_SERVERNAME).`;
  }
  if (/alert (certificate required|bad certificate|unknown ca)/i.test(err?.message ?? '')) {
    return 'Redis refused our client certificate. If Redis runs with tls-auth-clients, set both REDIS_TLS_CLIENT_CERT_PATH and REDIS_TLS_CLIENT_KEY_PATH to a certificate signed by the CA Redis trusts.';
  }
  return null;
}
