// Container health probe: `node scripts/healthcheck.js` exits 0 when GET /api/health answers 200.
// Works for both plain HTTP and HTTPS, so docker-compose does not need to change when HTTPS is switched on:
//   healthcheck:
//     test: ["CMD", "node", "scripts/healthcheck.js"]
import http from 'node:http';
import https from 'node:https';
import { isHttpsEnabled } from '../src/tls.js';

const useHttps = isHttpsEnabled();
const port = Number(process.env.PORT || 4000);
const client = useHttps ? https : http;

const req = client.get({
  host: '127.0.0.1',
  port,
  path: '/api/health',
  timeout: 3000,
  // The probe talks to this same container over loopback; the certificate is normally issued for a public name,
  // so name/chain verification would only produce false alarms here. Nothing leaves the container.
  ...(useHttps && { rejectUnauthorized: false })
}, res => {
  res.resume();
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('timeout', () => req.destroy());
req.on('error', () => process.exit(1));
