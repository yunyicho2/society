// 업무분장 탭에서 질문과 관련된 줄 찾기 (규정 챗봇에 근거로 함께 보냄)
// 한국어는 띄어쓰기·복합어가 제각각이라 두 글자씩 겹치는 정도(바이그램)로 점수를 매김

// 질문에 흔히 들어가지만 업무를 가리키지 않는 말
const STOP = /담당|업무|누구|어느|어디|선생|선생님|부서|맡|하나요|인가요|알려|궁금|문의|관련|해야|하면|되나|있나|무엇|뭐야|뭔가/g;

const bigrams = s => {
  const out = new Set(); const t = s.replace(/[^가-힣A-Za-z0-9]/g, ' ');
  for (const w of t.split(/\s+/)) for (let i = 0; i + 1 < w.length; i++) out.add(w.slice(i, i + 2).toLowerCase());
  return out;
};

export function matchDuties(question, duties, limit = 8) {
  const q = String(question || '');
  // 이름이 그대로 나오면 그 사람 줄은 모두
  const byName = duties.filter(d => d.name.length >= 2 && q.includes(d.name));
  const qb = bigrams(q.replace(STOP, ' '));
  if (!qb.size && !byName.length) return [];
  const scored = duties.map(d => {
    const head = bigrams(d.dept + ' ' + d.role), body = bigrams(d.detail.join(' '));
    let s = 0; for (const g of qb) s += head.has(g) ? 2 : body.has(g) ? 1 : 0;
    return { d, s };
  }).filter(x => x.s >= Math.min(2, qb.size)).sort((a, b) => b.s - a.s);
  const top = scored.length ? scored[0].s : 0;
  const picked = scored.filter(x => x.s >= top * 0.6).slice(0, limit).map(x => x.d);
  return [...new Set([...byName, ...picked])].slice(0, limit + byName.length);
}

export const dutyText = rows => rows.map(d =>
  '[' + d.dept + (d.role ? ' · ' + d.role : '') + '] 담당: ' + d.name + (d.detail.length ? '\n- ' + d.detail.join('\n- ') : '')).join('\n\n');
