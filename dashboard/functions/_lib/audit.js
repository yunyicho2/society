// 쓰기 기록 (누가 언제 무엇을). 학생 정보는 넣지 않는다.
export async function audit(env, email, action, detail) {
  try {
    await env.DB.prepare('INSERT INTO audit_log (email, action, detail) VALUES (?, ?, ?)').bind(email, action, String(detail || '').slice(0, 500)).run();
  } catch (e) { console.error('audit', e); }
}

// AI 호출 하루 한도 (비용 관리). 넘으면 false
export async function takeQuota(env, email, kind, limit) {
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    'INSERT INTO ai_usage (email, day, kind, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(email, day, kind) DO UPDATE SET n = n + 1 RETURNING n',
  ).bind(email, day, kind).first();
  return !row || row.n <= limit;
}
