// 나이스 출결 엑셀 → 월별 출결 확인현황 행 (지각·조퇴·결과, 미인정은 결석 포함)
// 나이스 화면마다 열 순서가 달라서 머리글 이름으로 열을 찾는다.
// 머리글 예: 번호 | 성명 | 일자 | 출결구분(질병지각 등) | 사유 | 교시
import { DOW, dow } from './dates.js';

const S = v => (v == null ? '' : String(v)).trim();

export function toDate(v, year) {
  if (typeof v === 'number' && v > 20000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  const s = S(v);
  let m = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = /^(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(s);
  if (m && year) return year + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return '';
}

export function splitType(s) {
  s = S(s).replace(/\s+/g, '');
  const kind = /미인정|무단/.test(s) ? '미인정' : /질병|병/.test(s) ? '질병' : /인정|출석인정/.test(s) ? '인정' : /기타/.test(s) ? '기타' : '';
  const act = (/결석|지각|조퇴|결과/.exec(s) || [])[0] || '';
  return { kind, act };
}

export function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i].map(S);
    const no = r.findIndex(c => /^(번호|번)$/.test(c)), name = r.findIndex(c => /성명|이름/.test(c));
    if (no >= 0 && name >= 0) {
      const col = re => r.findIndex(c => re.test(c));
      return {
        at: i, no, name,
        date: col(/일자|날짜|출결일|^일$/),
        type: col(/출결구분|출결종류|구분|출결$/),
        reason: col(/사유|내용|비고/),
        period: col(/교시/),
      };
    }
  }
  return null;
}

export function parseAttendance(rows, { year, month }) {
  const h = findHeader(rows);
  if (!h) throw new Error('엑셀에서 번호·성명 머리글을 찾지 못함');
  if (h.date < 0 || h.type < 0) throw new Error('엑셀에서 일자·출결구분 열을 찾지 못함');
  const out = [];
  let lastNo = '', lastName = '';
  rows.slice(h.at + 1).forEach(r => {
    // 같은 학생이 여러 줄이면 번호·성명 칸이 비어 있는 경우가 있음 (병합 셀)
    const no = S(r[h.no]) || lastNo, name = S(r[h.name]) || lastName;
    lastNo = no; lastName = name;
    const d = toDate(r[h.date], year), t = splitType(r[h.type]);
    if (!d || !name || !t.act) return;
    if (Number(d.slice(5, 7)) !== Number(month) || (year && d.slice(0, 4) !== String(year))) return;
    if (!(['지각', '조퇴', '결과'].includes(t.act) || t.kind === '미인정')) return;
    out.push({ no, name, kind: t.kind || '-', act: t.act, reason: h.reason >= 0 ? S(r[h.reason]) : '', day: Number(d.slice(8)), dow: DOW[dow(d)], period: h.period >= 0 ? S(r[h.period]) : '', date: d });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || Number(a.no) - Number(b.no));
}
