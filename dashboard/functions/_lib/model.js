// 학교 구글 시트의 탭들을 계산하기 쉬운 형태로 바꿈 (순수 함수 — 테스트에서 바로 씀).
// 모든 탭은 1행 제목, 2행 안내, 3행 머리글, 4행부터 자료. 비고에 '예시'가 들어간 행은 건너뜀.
import { addDays } from '../../public/js/lib/dates.js';

export const DATA_ROW = 4;
export const RANGES = {
  perm: '권한!A4:E',
  tt: '전체시간표!A4:I',
  cal: '학사일정!A4:G',
  duty: '당번표!A4:K',
  plan: '월중계획!A4:H',
  boss: '관리자일정!A4:F',
  subs: '대강교체!A4:M',
  files: '그외자료!A4:F',
};

const S = v => (v == null ? '' : String(v)).trim();
const isExample = row => row.some(c => /^예시( 행)?$/.test(S(c)));

// 시트 날짜(일련번호 또는 글자) → 'YYYY-MM-DD'
export function toISO(v) {
  if (typeof v === 'number' && v > 20000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  }
  const s = S(v);
  let m = /^(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return '';
}
// 시트 시각(하루의 비율 또는 글자) → 'HH:MM'
export function toTime(v) {
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const min = Math.round(v * 1440); return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }
  return S(v);
}

const DAYS = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4 };

// 전체시간표: 교사 | 요일 | 1교시 … 7교시, 칸은 '과목 학급' (예: '국1 1-3', '탐A 316호', '창체')
export function parseTimetable(rows) {
  const tt = {};
  rows.forEach(r => {
    const name = S(r[0]), w = DAYS[S(r[1]).slice(0, 1)];
    if (!name || w == null) return;
    const g = tt[name] || (tt[name] = {});
    for (let p = 1; p <= 7; p++) {
      const v = S(r[1 + p]).replace(/\s+/g, ' ');
      if (!v) continue;
      const i = v.lastIndexOf(' ');
      const subj = i > 0 ? v.slice(0, i) : v, cls = i > 0 ? v.slice(i + 1) : '';
      g[w + '-' + p] = subj + '|' + cls;
    }
  });
  return tt;
}

// '전체' → [1,2,3], '3학년' → [3], '1·2학년' → [1,2]
export function parseGrades(v) {
  const s = S(v); if (!s || /전체|전학년/.test(s)) return [1, 2, 3];
  const g = [...new Set((s.match(/[123]/g) || []).map(Number))];
  return g.length ? g : [1, 2, 3];
}
// '전체' → 1~7, '3~7교시' → [3..7], '1,2교시' → [1,2], '없음' → []
export function parsePeriods(v) {
  const s = S(v); if (!s || /전체|종일/.test(s)) return [1, 2, 3, 4, 5, 6, 7];
  if (/없음|정상/.test(s)) return [];
  const out = new Set();
  for (const m of s.matchAll(/(\d)\s*[~\-–]\s*(\d)|(\d)/g)) {
    if (m[3]) out.add(Number(m[3]));
    else for (let p = Number(m[1]); p <= Number(m[2]); p++) out.add(p);
  }
  return [...out].filter(p => p >= 1 && p <= 7).sort((a, b) => a - b);
}

// 학사일정: 날짜 | 요일 | 내용 | 구분 | 대상 학년 | 수업 없는 교시 | 비고
// rules: 수업 없는 교시 (계산용), events: 같은 내용이 이어지는 날을 묶은 일정 (화면용)
export function parseCalendar(rows) {
  const rules = [], items = [];
  rows.forEach(r => {
    if (isExample(r)) return;
    const d = toISO(r[0]), label = S(r[2]); if (!d || !label) return;
    const grades = parseGrades(r[4]), periods = parsePeriods(r[5]);
    if (periods.length) rules.push({ d, label, grades, periods });
    items.push({ d, label, kind: S(r[3]), grades, periods, memo: S(r[6]) });
  });
  items.sort((a, b) => a.d.localeCompare(b.d));
  const events = [];
  items.forEach(it => {
    const last = events[events.length - 1];
    // 같은 내용이 사흘 안에 다시 나오면 한 일정으로 (주말을 건너뛰는 시험 기간 등)
    if (last && last.label === it.label && it.d <= addDays(last.e, 3)) { last.e = it.d > last.e ? it.d : last.e; last.parts.push(it); return; }
    events.push({ s: it.d, e: it.d, label: it.label, parts: [it] });
  });
  events.forEach(ev => {
    const all = ev.parts.every(p => p.grades.length === 3 && p.periods.length === 7);
    const memo = ev.parts.map(p => p.memo).find(m => m && !/^\d{1,2}\/\d{1,2}/.test(m));
    ev.note = all ? '수업 없음' : memo || ev.parts.filter(p => p.periods.length).map(p =>
      (p.grades.length === 3 ? '전 학년' : p.grades.join('·') + '학년') + ' ' + (p.periods.length === 7 ? '종일' : p.periods[0] + '~' + p.periods[p.periods.length - 1] + '교시') + ' 수업 없음').join(', ');
    delete ev.parts;
  });
  return { rules, events };
}

// 당번표: 날짜 | 요일 | 아침감독 1·2·3학년 | 야간자습 | 토요감독 오전·오후 | 급식실 질서지도 | 교통지도 | 비고
export function parseDuty(rows) {
  const duty = {};
  rows.forEach(r => {
    if (isExample(r)) return;
    const d = toISO(r[0]); if (!d) return;
    duty[d] = { a1: S(r[2]), a2: S(r[3]), a3: S(r[4]), night: S(r[5]), satAm: S(r[6]), satPm: S(r[7]), meal: S(r[8]), traffic: S(r[9]), memo: S(r[10]) };
  });
  return duty;
}

// 월중계획: 날짜 | 요일 | 시간·교시 | 일정 | 장소 | 대상 | 담당 부서 | 아침 안내 포함
export function parsePlans(rows) {
  return rows.filter(r => !isExample(r) && toISO(r[0]) && S(r[3])).map(r => ({
    d: toISO(r[0]), time: toTime(r[2]), title: S(r[3]), place: S(r[4]), target: S(r[5]), dept: S(r[6]),
    morning: r[7] === true || /^(true|o|○|예)$/i.test(S(r[7])),
  }));
}

// 관리자일정: 날짜 | 요일 | 직위 | 내용 | 시간 | 비고
export function parseBoss(rows) {
  return rows.filter(r => !isExample(r) && toISO(r[0]) && S(r[3])).map(r => ({ d: toISO(r[0]), who: S(r[2]), title: S(r[3]), time: toTime(r[4]) }));
}

// 권한: 개인 지메일 | 이름 | 역할 | 담당 업무 | 비고  (역할은 쉼표로 여러 개)
export function parsePerms(rows) {
  const map = {};
  rows.forEach(r => {
    const email = S(r[0]).toLowerCase(); if (!email || !email.includes('@')) return;
    map[email] = { name: S(r[1]), roles: normalizeRoles(S(r[2])), duty: S(r[3]) };
  });
  return map;
}
export function normalizeRoles(s) {
  const out = new Set(['교사']);
  S(s).split(/[,/·]/).map(x => x.trim()).filter(Boolean).forEach(x => {
    if (/수업계|시간표/.test(x)) out.add('시간표 담당');
    else if (/교무부장/.test(x)) out.add('교무부장');
    else if (/정보/.test(x)) out.add('정보 담당');
    else if (/관리자|교장|교감/.test(x)) out.add('관리자');
  });
  return [...out];
}

// 대강교체: 날짜 | 요일 | 교시 | 학급 | 과목 | 결원 교사 | 사유 | 담당 교사 | 구분 | 입력자 | 비고 | 상태 | 신청번호
export function parseSubs(rows) {
  const out = [];
  rows.forEach((r, i) => {
    if (isExample(r)) return;
    const d = toISO(r[0]); if (!d) return;
    out.push({
      row: DATA_ROW + i, date: d, p: Number(r[2]) || 0, cls: S(r[3]), subj: S(r[4]), absent: S(r[5]), why: S(r[6]),
      who: S(r[7]), kind: S(r[8]) || '교체', by: S(r[9]), memo: S(r[10]), status: S(r[11]) || '확정', id: S(r[12]),
    });
  });
  return out;
}

// 그외자료: 자료명 | 분류 | 링크 | 올린 사람 | 올린 날짜 | 비고
export function parseFiles(rows) {
  return rows.filter(r => !isExample(r) && S(r[0])).map(r => ({
    name: S(r[0]), cat: S(r[1]), url: /^https:\/\//.test(S(r[2])) ? S(r[2]) : '', by: S(r[3]), date: toISO(r[4]),
  })).reverse();
}

export function buildModel(v) {
  const cal = parseCalendar(v.cal || []);
  return {
    perms: parsePerms(v.perm || []), tt: parseTimetable(v.tt || []), rules: cal.rules, events: cal.events,
    duty: parseDuty(v.duty || []), plans: parsePlans(v.plan || []), boss: parseBoss(v.boss || []),
    subs: parseSubs(v.subs || []), files: parseFiles(v.files || []),
  };
}
