// 선생님별 화면 설정 (카드 숨기기·순서, 과목 별칭, 진도 마무리일, 내 바로가기, 시간표 수정 칸)
import { HttpError, json, readJson } from '../_lib/http.js';

const MAX = 20_000;

export async function onRequestGet({ env, data }) {
  const row = await env.DB.prepare('SELECT data FROM prefs WHERE email = ?').bind(data.user.email).first();
  return json({ prefs: row ? JSON.parse(row.data) : {} });
}

export async function onRequestPut({ request, env, data }) {
  const body = await readJson(request, MAX);
  const p = body.prefs;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new HttpError(400, 'prefs 형식 오류');
  // 링크는 http(s)만 저장 (javascript: 등 차단)
  if (Array.isArray(p.links)) p.links = p.links.filter(l => l && /^https?:\/\//.test(String(l.url))).slice(0, 20)
    .map(l => ({ name: String(l.name).slice(0, 40), url: String(l.url).slice(0, 500) }));
  const text = JSON.stringify(p);
  if (text.length > MAX) throw new HttpError(413, '설정이 너무 큼');
  await env.DB.prepare('INSERT INTO prefs (email, data, updated_at) VALUES (?1, ?2, datetime(\'now\')) ON CONFLICT(email) DO UPDATE SET data = ?2, updated_at = datetime(\'now\')')
    .bind(data.user.email, text).run();
  return json({ ok: true });
}
