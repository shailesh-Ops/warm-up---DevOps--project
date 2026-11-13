# TLS for the Orbit API: Redis (`rediss://`) and HTTPS

Everything is configured with environment variables (see `.env.example`). All parsing lives in `src/tls.js`,
`src/redis.js` builds the Redis client from it and `src/server.js` starts HTTP or HTTPS.

## 1. Create local development certificates

From the repository root (needs `openssl`):

```bash
bash apps/api/scripts/gen-certs.sh
```

| File | Used by |
|------|---------|
| `certs/ca.crt` | Everything that must trust the certificates (API -> Redis, browser, `curl --cacert`) |
| `certs/redis.crt`, `certs/redis.key` | Redis server (names: `redis`, `localhost`, `127.0.0.1`) |
| `certs/api.crt`, `certs/api.key` | API HTTPS (names: `localhost`, `backend`, `127.0.0.1`) |
| `certs/client.crt`, `certs/client.key` | Optional mTLS client certificate for API -> Redis |
| `ca-private/ca.key` | Signs certificates. Never mount it into a container |

Add `certs/` and `ca-private/` to `.gitignore`. These certificates are for local development only; in production use
certificates from a real CA or your platform's secret store.

## 2. Redis over TLS

```env
REDIS_URL=rediss://:redispass@redis:6379     # rediss:// = TLS (two s)
REDIS_TLS_CA_CERT_PATH=/certs/ca.crt         # REDIS_TLS_CA_PATH also works
REDIS_TLS_REJECT_UNAUTHORIZED=true           # false is refused when NODE_ENV=production
# REDIS_TLS_SERVERNAME=redis                 # only if the URL host is not a name in the certificate
# REDIS_TLS_CLIENT_CERT_PATH=/certs/client.crt   # mTLS: set both or neither
# REDIS_TLS_CLIENT_KEY_PATH=/certs/client.key
```

The host in `REDIS_URL` must be one of the names in the Redis certificate. Inside Docker use the service name
(`redis`); `localhost` inside the API container is the API container itself.

Mount only what the API needs, read-only:

```yaml
backend:
  volumes:
    - ./certs/ca.crt:/certs/ca.crt:ro
    # mTLS only:
    # - ./certs/client.crt:/certs/client.crt:ro
    # - ./certs/client.key:/certs/client.key:ro
```

On startup the API logs `Redis connected (rediss://redis:6379, TLS).` Certificate mistakes (untrusted CA, wrong name,
expired, client certificate required) stop the start immediately with an explanation instead of retrying for 30 seconds.

## 3. HTTPS for the API (optional)

```env
HTTPS_KEY_PATH=/certs/api.key
HTTPS_CERT_PATH=/certs/api.crt
# HTTPS_MIN_VERSION=TLSv1.2   (or TLSv1.3)
# HTTPS_CA_PATH=              extra chain / intermediate
# HTTPS_PASSPHRASE=           if the key is encrypted
# HTTP_REDIRECT_PORT=4080     plain-HTTP port that only redirects to PUBLIC_URL
# PUBLIC_URL=https://localhost:4000
```

* Both paths set -> HTTPS. Neither set -> plain HTTP. One of them set, or an unreadable file -> the API refuses to
  start and names the variable. `HTTPS_ENABLED=0/1` overrides the automatic choice.
* Behind a reverse proxy that already terminates TLS keep the API on plain HTTP and set `TRUST_PROXY=1`.
* The session cookie `Secure` flag follows the connection (`COOKIE_SECURE=auto`), so it is set when HTTPS is on.
* HSTS is sent only when `NODE_ENV=production` and the API itself serves HTTPS. (HSTS applies to the whole host, so
  sending it from a local development certificate would force `http://localhost:*` to HTTPS for every other dev server.)
* **Switch the web app to HTTPS at the same time.** Browsers can treat an `http://` page calling an `https://` API as a
  different site ("schemeful same-site") and then do not send the `SameSite=Lax` session cookie, so login looks
  broken. Add the HTTPS web origin to `WEB_ORIGIN`.
* Trust `certs/ca.crt` in your browser/OS (or use `mkcert`), or call the API with `curl --cacert certs/ca.crt`. Node
  clients use `NODE_EXTRA_CA_CERTS=certs/ca.crt`.

## 4. Container health check

`scripts/healthcheck.js` calls `GET /api/health` over HTTP or HTTPS depending on the same variables, so the compose
file does not change when HTTPS is switched on:

```yaml
healthcheck:
  test: ["CMD", "node", "scripts/healthcheck.js"]
  interval: 5s
  timeout: 3s
  retries: 5
  start_period: 10s
```

`/api/health` answers `503` quickly when Redis or PostgreSQL is unavailable and recovers by itself when they return.

## 5. Troubleshooting

| Message | Cause / fix |
|---------|-------------|
| `Redis TLS certificate rejected (self-signed certificate in certificate chain)` | The API does not trust the CA that signed the Redis certificate. Check `REDIS_TLS_CA_CERT_PATH` points to `ca.crt` |
| `Hostname/IP does not match certificate's altnames` | The `REDIS_URL` host is not in the certificate. Use a listed name or set `REDIS_TLS_SERVERNAME` |
| `Redis refused our client certificate` | Redis runs with `tls-auth-clients yes`; set `REDIS_TLS_CLIENT_CERT_PATH` and `REDIS_TLS_CLIENT_KEY_PATH` |
| `read ECONNRESET` for 30 s | Plain `redis://` against a TLS-only Redis. Use `rediss://` |
| `Redis TLS certificate settings require REDIS_URL to use rediss://` | Certificate variables are set but the URL is `redis://` |
| `... points to a file that cannot be read` | Wrong path or the volume is not mounted. Paths are relative to the API working directory |
| `API port 4000 is already in use` | Another process (or an older container) holds the port |
| Login does nothing after enabling HTTPS | Web app is probably still on `http://`; see the same-site note above |
