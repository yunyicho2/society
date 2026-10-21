// 시간표·학사일정 계산 (브라우저와 서버, 테스트에서 함께 씀). DOM에 의존하지 않음.
//
// D = {
//   today: '2026-10-15', lastDay: '2026-12-29', rangeStart: '2026-10-19', progressEnd: '2026-12-04',
//   tt: { 교사이름: { '요일(0=월)-교시': '과목|학급' } },
//   rules: [{ d, label, grades:[1,2,3], periods:[1..7] }],   // 수업 없는 교시
//   events: [{ s, e, label, note }],
//   classGrade: { '316호': 2 }                                 // 학년을 이름으로 알 수 없는 교실
// }
import { addDays, dow } from './dates.js';

// 교시 시각 (24시 체계)
export const PT = {
  1: ['08:30', '09:20'], 2: ['09:30', '10:20'], 3: ['10:30', '11:20'], 4: ['11:30', '12:20'],
  5: ['13:30', '14:20'], 6: ['14:30', '15:20'], 7: ['15:40', '16:30'],
};
export const MAX_RUN = 3;  // 3시간 연강이 생기는 교체는 추천하지 않음

// 교과군: 동교과 교체 판단과 과목 색에 사용
export const FAM = s =>
  /^국/.test(s) ? '국어'
  : /^(수\d|미적|기하|실통|수학)/.test(s) ? '수학'
  : /^영/.test(s) ? '영어'
  : /^(사\d|역사|통합사회|한국사)/.test(s) ? '사회'
  : /^(과\d|생환|통합과학)/.test(s) ? '과학'
  : /^(체육|운건|눈건)/.test(s) ? '체육'
  : /^(음악|미\d|미술)/.test(s) ? '예술'
  : s;

export function createSchedule(D) {
  const rules = D.rules || [], events = D.events || [], tt = D.tt || {};

  const gradeOf = c => {
    if (D.classGrade && D.classGrade[c]) return D.classGrade[c];
    const m = /^([123])-/.exec(c || ''); return m ? Number(m[1]) : null;
  };

  // 그 날 그 교시가 수업 없는 시간인지 (주말·방학·학사일정)
  function noClass(date, grade, p) {
    const w = dow(date); if (w === 0 || w === 6 || (D.lastDay && date > D.lastDay)) return true;
    if (grade) return rules.some(r => r.d === date && r.periods.includes(p) && r.grades.includes(grade));
    return [1, 2, 3].every(g => noClass(date, g, p));
  }

  function slots(name) {
    return Object.entries(tt[name] || {}).map(([k, v]) => {
      const [w, p] = k.split('-').map(Number); const [subj, cls] = v.split('|');
      return { w, p, subj, cls: cls || '' };
    });
  }
  const busy = (name, w, p) => !!(tt[name] || {})[w + '-' + p];
  const cellOf = (name, w, p) => { const v = (tt[name] || {})[w + '-' + p]; if (!v) return { s: '', c: '' }; const [s, c] = v.split('|'); return { s, c: c || '' }; };

  function lessonsOn(name, date) {
    const w = dow(date) - 1; if (w < 0 || w > 4) return [];
    return slots(name).filter(s => s.w === w && s.subj !== '창체').sort((a, b) => a.p - b.p)
      .map(s => Object.assign({}, s, { date, off: noClass(date, gradeOf(s.cls), s.p) }));
  }

  // 기간 안에서 과목·학급별 실제 수업 수와 학사일정으로 빠지는 수
  function remaining(name, from, to) {
    const map = {};
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const w = dow(d) - 1; if (w < 0 || w > 4) continue;
      slots(name).forEach(s => {
        if (s.w !== w || s.subj === '창체') return;
        const k = s.subj + ' ' + s.cls; const m = map[k] || (map[k] = { subj: s.subj, cls: s.cls, n: 0, lost: 0 });
        if (noClass(d, gradeOf(s.cls), s.p)) m.lost++; else m.n++;
      });
    }
    return Object.values(map).sort((a, b) => a.subj.localeCompare(b.subj) || a.cls.localeCompare(b.cls));
  }

  // 범위 시작일(1차 정기고사 다음)부터 진도 마무리일까지 반별 수업 날짜 = 1차시, 2차시, ...
  function lessonSeq(name, end, untrack = []) {
    const map = {};
    for (let d = D.rangeStart; d <= end; d = addDays(d, 1)) {
      const w = dow(d) - 1; if (w < 0 || w > 4) continue;
      slots(name).filter(s => s.w === w && s.subj !== '창체').sort((a, b) => a.p - b.p).forEach(s => {
        if (noClass(d, gradeOf(s.cls), s.p)) return;
        const k = s.subj + ' ' + s.cls; (map[k] = map[k] || { subj: s.subj, cls: s.cls, dates: [] }).dates.push({ d, p: s.p });
      });
    }
    return Object.values(map).filter(r => !untrack.includes(r.subj + ' ' + r.cls))
      .sort((a, b) => a.subj.localeCompare(b.subj) || a.cls.localeCompare(b.cls));
  }

  // 과목별 최소·최대 차시 반
  function progressSummary(name, end, untrack) {
    const g = {};
    lessonSeq(name, end, untrack).forEach(r => (g[r.subj] = g[r.subj] || []).push(r));
    return Object.entries(g).map(([subj, rows]) => {
      const tot = rows.map(r => r.dates.length), min = Math.min(...tot), max = Math.max(...tot);
      return {
        subj, rows, min, max,
        minClasses: rows.filter(r => r.dates.length === min).map(r => r.cls),
        maxClasses: rows.filter(r => r.dates.length === max).map(r => r.cls),
      };
    });
  }

  const famOf = name => new Set(slots(name).filter(s => s.subj !== '창체').map(s => FAM(s.subj)));

  // 새 수업을 넣었을 때 그 교시가 들어간 연강 길이 (4·5교시 사이 점심시간에서 끊김)
  function runWith(name, w, addP, removeP) {
    const set = new Set(); for (let p = 1; p <= 7; p++) if (busy(name, w, p) && p !== removeP) set.add(p);
    set.add(addP);
    const block = addP <= 4 ? [1, 4] : [5, 7]; let lo = addP, hi = addP;
    while (lo - 1 >= block[0] && set.has(lo - 1)) lo--;
    while (hi + 1 <= block[1] && set.has(hi + 1)) hi++;
    return hi - lo + 1;
  }

  // 같은 반 수업이거나 같은 교과(동교과) 수업과 맞바꾸는 교체 후보. 보강은 쓰지 않음.
  function candidates(A, L, away, opts = {}) {
    const today = opts.today || D.today, before = opts.before ?? 7, after = opts.after ?? 14;
    const w = dow(L.date) - 1, swap = []; let cut = 0;
    const others = Object.keys(tt).filter(n => n !== A);
    const fam0 = FAM(L.subj);
    for (let k = -before; k <= after; k++) {
      const d2 = addDays(L.date, k), w2 = dow(d2) - 1;
      if (w2 < 0 || w2 > 4 || d2 <= today) continue;
      others.forEach(B => slots(B).forEach(s => {
        if (s.w !== w2 || s.subj === '창체') return;
        const sameCls = s.cls === L.cls, sameSub = !sameCls && FAM(s.subj) === fam0 && !/^탐/.test(s.subj);
        if (!sameCls && !sameSub) return;
        if (away && away(d2, s.p)) return;          // 내가 자리를 비우는 시간에는 받을 수 없음
        if (noClass(d2, gradeOf(s.cls), s.p)) return;
        if (busy(A, w2, s.p) || busy(B, w, L.p)) return;
        const same = d2 === L.date;
        const rB = runWith(B, w, L.p, same ? s.p : 0), rA = runWith(A, w2, s.p, same ? L.p : 0);
        if (rB >= MAX_RUN || rA >= MAX_RUN) { cut++; return; }
        swap.push({ B, date: d2, p: s.p, subj: s.subj, cls: s.cls, sameSub, dist: Math.abs(k), rA, rB });
      }));
    }
    swap.sort((a, b) => (a.sameSub - b.sameSub) || a.dist - b.dist || a.date.localeCompare(b.date) || a.p - b.p);
    return { swap, cut };
  }

  // 결강 수업마다 겹치지 않는 교체를 먼저 고름 (같은 시간에 두 수업을 받지 않게)
  function pickDefaults(lessons) {
    const used = new Set();
    return lessons.map(l => {
      const j = l.cand.swap.findIndex(c => !used.has(c.date + '-' + c.p));
      if (j < 0) return -1;
      used.add(l.cand.swap[j].date + '-' + l.cand.swap[j].p); return j;
    });
  }

  const eventsOn = date => events.filter(e => e.s <= date && date <= e.e);

  // 교과군은 고정 색, 나머지(선택 블록 등)는 남은 색을 차례로 배정
  const subjIndex = (() => {
    const FAMC = { 국어: 0, 수학: 1, 영어: 2, 사회: 3, 과학: 4, 체육: 5, 예술: 6 };
    const m = {}, rest = [7, 1, 4, 6, 0, 5, 2]; let i = 0;
    [...new Set(Object.values(tt).flatMap(g => Object.values(g).map(v => v.split('|')[0])))].sort().forEach(s => {
      if (s === '창체') return; const f = FAM(s); m[s] = f in FAMC ? FAMC[f] : rest[i++ % rest.length];
    });
    return m;
  })();

  return {
    D, gradeOf, noClass, slots, busy, cellOf, lessonsOn, remaining, lessonSeq, progressSummary,
    famOf, runWith, candidates, pickDefaults, eventsOn, subjIndex,
  };
}

// 복무 시각과 겹치는 교시만 결강 (예: 13:30~16:30이면 그날 5~7교시만)
export function makeAway({ from, to, t1, t2 }) {
  const end = to < from ? from : to;
  return (date, p) => {
    if (date < from || date > end) return false;
    const st = date === from ? t1 : '00:00', en = date === end ? t2 : '24:00';
    return PT[p][0] < en && PT[p][1] > st;
  };
}

// 복무 시간과 겹치는 내 수업 목록 (수업 변경 신청서의 결강 수업)
export function awayLessons(S, teacher, range) {
  const away = makeAway(range), out = [];
  const end = range.to < range.from ? range.from : range.to;
  for (let d = range.from; d <= end; d = addDays(d, 1)) {
    S.lessonsOn(teacher, d).filter(l => !l.off && away(d, l.p)).forEach(l => out.push(l));
  }
  return { away, lessons: out };
}

// 같은 과목을 요일마다 다른 영역으로 가르칠 때 (예: 통합사회 월화수 '정치', 목금 '경제')
// split = { 과목: { 요일(0=월): '영역' } } → 그 칸의 과목 이름을 '과목(영역)'으로 바꿔 진도를 따로 셈
export const splitName = (subj, label) => subj + '(' + label + ')';
export const baseSubject = s => String(s || '').replace(/\([^()]*\)$/, '');
export function applySplit(slots, split) {
  if (!split || !Object.keys(split).length) return slots;
  const out = {};
  Object.entries(slots).forEach(([k, v]) => {
    const [subj, cls = ''] = v.split('|'), w = k.split('-')[0];
    const label = split[subj] && String(split[subj][w] || '').trim();
    out[k] = label ? splitName(subj, label) + '|' + cls : v;
  });
  return out;
}
