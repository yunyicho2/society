// 날짜는 모두 'YYYY-MM-DD' 문자열로 다룬다 (UTC 기준 계산이라 시간대 영향 없음).
export const DOW = '일월화수목금토';

export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const iso = t => t.toISOString().slice(0, 10);
export const addDays = (s, n) => { const t = parse(s); t.setUTCDate(t.getUTCDate() + n); return iso(t); };
export const dow = s => parse(s).getUTCDay();
export const md = s => { const t = parse(s); return (t.getUTCMonth() + 1) + '/' + t.getUTCDate(); };
export const mdk = s => md(s) + '(' + DOW[dow(s)] + ')';
export const ymd = s => { const t = parse(s); return t.getUTCFullYear() + '년 ' + (t.getUTCMonth() + 1) + '월 ' + t.getUTCDate() + '일'; };
export const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

// 서울 시간 기준 오늘 (서버·브라우저 어디서 돌려도 같은 값)
export function todayKST(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

// 'HH:MM' 비교용
export const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
