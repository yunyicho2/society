// 내 메모 (스티키 노트). 모든 쿼리에 email 조건을 붙여 다른 선생님 메모는 읽거나 고칠 수 없음
import { HttpError, json, readJson, str } from '../_lib/http.js';

const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'];
const MAX_NOTES = 60, MAX_TEXT = 2000;
const pick = r => ({ id: r.id, text: r.text, color: r.color, pinned: !!r.pinned, updated: r.updated_at });

export async function onRequestGet({ env, data }) {
  const { results } = await env.DB.prepare('SELECT * FROM notes WHERE email = ? ORDER BY pinned DESC, updated_at DESC').bind(data.user.email).all();
  return json({ notes: (results || []).map(pick) });
}

export async function onRequestPost({ request, env, data }) {
  const b = await readJson(request, 10_000);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM notes WHERE email = ?').bind(data.user.email).first();
  if (n && n.n >= MAX_NOTES) throw new HttpError(409, '메모는 ' + MAX_NOTES + '개까지. 다 쓴 메모를 지워 주세요');
  const id = crypto.randomUUID().slice(0, 12);
  const color = COLORS.includes(b.color) ? b.color : 'yellow';
  await env.DB.prepare('INSERT INTO notes (id, email, text, color) VALUES (?, ?, ?, ?)').bind(id, data.user.email, str(b.text, MAX_TEXT), color).run();
  const row = await env.DB.prepare('SELECT * FROM notes WHERE id = ? AND email = ?').bind(id, data.user.email).first();
  return json({ note: pick(row) });
}

export async function onRequestPut({ request, env, data }) {
  const b = await readJson(request, 10_000);
  const id = str(b.id, 20);
  const cur = await env.DB.prepare('SELECT * FROM notes WHERE id = ? AND email = ?').bind(id, data.user.email).first();
  if (!cur) throw new HttpError(404, '메모를 찾지 못함');
  const text = typeof b.text === 'string' ? str(b.text, MAX_TEXT) : cur.text;
  const color = COLORS.includes(b.color) ? b.color : cur.color;
  const pinned = typeof b.pinned === 'boolean' ? (b.pinned ? 1 : 0) : cur.pinned;
  await env.DB.prepare("UPDATE notes SET text = ?, color = ?, pinned = ?, updated_at = datetime('now') WHERE id = ? AND email = ?")
    .bind(text, color, pinned, id, data.user.email).run();
  const row = await env.DB.prepare('SELECT * FROM notes WHERE id = ? AND email = ?').bind(id, data.user.email).first();
  return json({ note: pick(row) });
}

export async function onRequestDelete({ request, env, data }) {
  const id = str(new URL(request.url).searchParams.get('id'), 20);
  await env.DB.prepare('DELETE FROM notes WHERE id = ? AND email = ?').bind(id, data.user.email).run();
  return json({ ok: true });
}
