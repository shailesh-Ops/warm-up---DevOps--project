// Allowed browser origins for CORS, CSRF checks and Socket.IO.
// WEB_ORIGIN is a comma-separated list, e.g. "http://localhost:5173,http://localhost:8000".

// Common local frontends: Vite dev server (5173), Vite preview (4173) and the
// containerised web app (8000). Only added outside production.
const DEV_ORIGINS = [5173, 4173, 8000].flatMap(port => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

/** Turn "http://localhost:8000/" (or with spaces / a path) into the canonical origin, or null if invalid. */
export function normalizeOrigin(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch { return null; }
}

export function buildAllowedOrigins(webOrigin, nodeEnv = 'development') {
  const entries = String(webOrigin ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const origins = [];
  const invalid = [];
  for (const entry of entries) {
    const origin = normalizeOrigin(entry);
    if (origin) origins.push(origin); else invalid.push(entry);
  }
  if (nodeEnv !== 'production') origins.push(...DEV_ORIGINS);
  return { origins: [...new Set(origins)], invalid };
}
