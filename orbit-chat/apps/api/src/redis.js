import { createClient } from 'redis';
import { buildRedisConfig } from './tls.js';

// All parsing and certificate loading lives in tls.js. REDIS_URL decides the transport:
//   redis://:password@host:6379    plain TCP (fine for a local Redis without TLS)
//   rediss://:password@host:6379   TLS, verified with REDIS_TLS_CA_CERT_PATH (+ optional mTLS client cert/key)
let config;
try {
  config = buildRedisConfig();
} catch (err) {
  // A readable one-line message instead of a stack trace for the usual mistakes (missing URL, bad certificate path).
  console.error(`Redis configuration: ${err.message}`);
  process.exit(1);
}

export const redisSettings = { useTls: config.useTls, mutualTls: config.mutualTls, displayUrl: config.displayUrl };
export const redis = createClient(config.options);

// node-redis keeps reconnecting on its own; just make sure a failure is visible (and never prints the password).
redis.on('error', err => console.error('Redis connection:', err.message));
