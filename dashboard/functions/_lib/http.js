export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(data, { status = 200, cache = 'no-store', headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, ...headers },
  });
}

export async function readJson(request, maxBytes = 200_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, '요청이 너무 큼');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, '요청이 너무 큼');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'JSON 형식이 아님'); }
}

export const need = (cond, msg, status = 400) => { if (!cond) throw new HttpError(status, msg); };

export const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
