// 규정 챗봇 문서 관리 (정보 담당·관리자). 글자는 브라우저에서 HWPX/TXT에서 뽑아 보냄
import { chunk, embed } from '../../_lib/rag.js';
import { can } from '../../_lib/roles.js';
import { audit } from '../../_lib/audit.js';
import { HttpError, json, readJson, str } from '../../_lib/http.js';
import { maskPII } from '../../../public/js/lib/pii.js';

const guard = u => { if (!can.manageDocs(u)) throw new HttpError(403, '정보 담당·관리자만 문서를 관리할 수 있음'); };

export async function onRequestGet({ env, data }) {
  guard(data.user);
  const { results } = await env.DB.prepare('SELECT id, title, chunks, uploaded_by, at FROM rag_docs ORDER BY at DESC').all();
  return json({ docs: results || [] });
}

export async function onRequestPost({ request, env, data }) {
  guard(data.user);
  const b = await readJson(request, 1_500_000);
  const title = str(b.title, 120), text = maskPII(String(b.text || '').slice(0, 1_000_000));
  if (!title || text.length < 20) throw new HttpError(400, '제목과 본문이 필요함');
  const parts = chunk(text);
  if (parts.length > 1500) throw new HttpError(413, '문서가 너무 김. 나눠서 올려 주세요');
  const id = crypto.randomUUID().slice(0, 12);
  const vecs = await embed(env, parts.map(p => title + '\n' + p));
  for (let i = 0; i < parts.length; i += 100) {
    await env.VEC.upsert(vecs.slice(i, i + 100).map((v, k) => ({ id: id + ':' + (i + k), values: v, metadata: { doc: id } })));
  }
  const stmts = [env.DB.prepare('INSERT INTO rag_docs (id, title, chunks, uploaded_by) VALUES (?, ?, ?, ?)').bind(id, title, parts.length, data.user.name)];
  parts.forEach((p, i) => stmts.push(env.DB.prepare('INSERT INTO rag_chunks (id, doc_id, idx, text) VALUES (?, ?, ?, ?)').bind(id + ':' + i, id, i, p)));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  await audit(env, data.user.email, 'docs.add', title + ' (' + parts.length + ')');
  return json({ ok: true, id, chunks: parts.length });
}

export async function onRequestDelete({ request, env, data }) {
  guard(data.user);
  const id = str(new URL(request.url).searchParams.get('id'), 20);
  const doc = await env.DB.prepare('SELECT chunks, title FROM rag_docs WHERE id = ?').bind(id).first();
  if (!doc) throw new HttpError(404, '문서를 찾지 못함');
  const ids = Array.from({ length: doc.chunks }, (_, i) => id + ':' + i);
  for (let i = 0; i < ids.length; i += 100) await env.VEC.deleteByIds(ids.slice(i, i + 100));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rag_chunks WHERE doc_id = ?').bind(id),
    env.DB.prepare('DELETE FROM rag_docs WHERE id = ?').bind(id),
  ]);
  await audit(env, data.user.email, 'docs.delete', doc.title);
  return json({ ok: true });
}
