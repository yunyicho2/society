// 차시 진도표의 단원·학습 내용 (선생님 본인만 읽고 씀)
import { HttpError, json, readJson, str } from '../_lib/http.js';

export async function onRequestGet({ env, data }) {
  const { results } = await env.DB.prepare('SELECT subj, data FROM plan_notes WHERE email = ?').bind(data.user.email).all();
  const notes = {}; (results || []).forEach(r => (notes[r.subj] = JSON.parse(r.data)));
  return json({ notes });
}

export async function onRequestPut({ request, env, data }) {
  const body = await readJson(request, 60_000);
  const subj = str(body.subj, 40);
  if (!subj || !Array.isArray(body.rows)) throw new HttpError(400, 'subj, rows 필요');
  const rows = body.rows.slice(0, 120).map(r => ({ unit: str(r && r.unit, 100), content: str(r && r.content, 300) }));
  await env.DB.prepare('INSERT INTO plan_notes (email, subj, data, updated_at) VALUES (?1, ?2, ?3, datetime(\'now\')) ON CONFLICT(email, subj) DO UPDATE SET data = ?3, updated_at = datetime(\'now\')')
    .bind(data.user.email, subj, JSON.stringify(rows)).run();
  return json({ ok: true });
}
