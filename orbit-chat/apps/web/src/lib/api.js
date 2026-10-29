export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export async function api(path, { method = 'GET', body, ...options } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...options
    });
  } catch {
    // fetch() only rejects when the browser could not get a usable response: server down, wrong URL, or a CORS block.
    const error = new Error(`Can't reach the Orbit server at ${API_URL}. Make sure the API is running and that this site's address (${window.location.origin}) is listed in WEB_ORIGIN.`);
    error.status = 0;
    error.network = true;
    throw error;
  }
  if (res.status === 204) return null;
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(payload.error || `Request failed (${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return payload;
}
