// 규정 문서 검색 (Workers AI 임베딩 + Vectorize). 원문 조각은 D1에 보관
export const EMBED_MODEL = '@cf/baai/bge-m3';  // 다국어(한국어) 임베딩, 1024차원

export async function embed(env, texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 50) {
    const r = await env.AI.run(EMBED_MODEL, { text: texts.slice(i, i + 50) });
    out.push(...r.data);
  }
  return out;
}

// 문단 경계를 살려 700자 안팎으로 자름 (앞 조각과 100자 겹침)
export function chunk(text, size = 700, overlap = 100) {
  const paras = String(text).replace(/\r/g, '').split(/\n{1,}/).map(s => s.trim()).filter(Boolean);
  const out = []; let cur = '';
  for (const p of paras) {
    if (cur && (cur + '\n' + p).length > size) { out.push(cur); cur = cur.slice(-overlap) + '\n' + p; }
    else cur = cur ? cur + '\n' + p : p;
    while (cur.length > size * 1.5) { out.push(cur.slice(0, size)); cur = cur.slice(size - overlap); }
  }
  if (cur) out.push(cur);
  return out;
}

export async function search(env, query, topK = 6) {
  const [vec] = await embed(env, [query]);
  const res = await env.VEC.query(vec, { topK });
  const hits = (res.matches || []).filter(m => m.score >= 0.35);
  if (!hits.length) return [];
  const ids = hits.map(h => h.id);
  const { results } = await env.DB.prepare(
    'SELECT c.id, c.text, d.title FROM rag_chunks c JOIN rag_docs d ON d.id = c.doc_id WHERE c.id IN (' + ids.map(() => '?').join(',') + ')',
  ).bind(...ids).all();
  const byId = Object.fromEntries((results || []).map(r => [r.id, r]));
  return hits.map(h => byId[h.id] && { ...byId[h.id], score: h.score }).filter(Boolean);
}
