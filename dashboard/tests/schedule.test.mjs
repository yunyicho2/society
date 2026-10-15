import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchedule, makeAway, awayLessons, FAM } from '../public/js/lib/schedule.js';
import { morningMsg } from '../public/js/lib/morning.js';

// 가상의 교사·시간표 (실제 학교 자료 아님)
const D = {
  today: '2026-10-15', rangeStart: '2026-10-19', progressEnd: '2026-12-04', lastDay: '2026-12-29',
  classGrade: { '316호': 2 },
  tt: {
    갑: { '0-1': '통합사회|1-1', '0-2': '통합사회|1-2', '0-5': '통합사회|1-3', '2-1': '통합사회|1-1', '2-3': '통합사회|1-2', '4-6': '통합사회|1-3', '1-7': '창체|' },
    을: { '0-3': '국1|1-1', '2-5': '국1|1-1', '1-1': '국1|1-2' },
    병: { '2-6': '통합사회|1-4', '1-2': '통합사회|1-5', '1-3': '통합사회|1-6', '1-4': '통합사회|1-4' },
  },
  rules: [
    { d: '2026-10-20', label: '모의고사', grades: [1, 2, 3], periods: [1, 2, 3, 4, 5, 6, 7] },
    { d: '2026-11-18', label: '수능 출정식', grades: [1, 2], periods: [3, 4, 5, 6, 7] },
  ],
  events: [{ s: '2026-10-20', e: '2026-10-20', label: '모의고사', note: '수업 없음' }],
};
const S = createSchedule(D);

test('학사일정으로 수업 없는 교시', () => {
  assert.equal(S.noClass('2026-10-20', 1, 3), true);
  assert.equal(S.noClass('2026-11-18', 1, 2), false);
  assert.equal(S.noClass('2026-11-18', 1, 3), true);
  assert.equal(S.noClass('2026-10-24', 1, 1), true);   // 토요일
  assert.equal(S.noClass('2026-12-30', 1, 1), true);   // 방학
  assert.equal(S.gradeOf('316호'), 2);
});

test('모든 반 1차시부터, 최소·최대 차시 계산', () => {
  const g = S.progressSummary('갑', '2026-10-30');
  assert.equal(g.length, 1);
  const rows = Object.fromEntries(g[0].rows.map(r => [r.cls, r.dates.length]));
  // 10/19(월)~10/30(금): 월 2주, 수 2주 / 10/20(화) 모의고사는 화요일이라 갑과 무관
  assert.deepEqual(rows, { '1-1': 4, '1-2': 4, '1-3': 4 });
  assert.equal(g[0].rows[0].dates[0].d, '2026-10-19');
  assert.equal(g[0].min, 4);
});

test('창체는 진도에서 빠짐', () => {
  assert.ok(!S.lessonSeq('갑', '2026-11-30').some(r => r.subj === '창체'));
});

test('연강 길이: 점심(4·5교시 사이)에서 끊김', () => {
  // 갑 월요일 1,2교시 수업 → 3교시를 더하면 3연강
  assert.equal(S.runWith('갑', 0, 3, 0), 3);
  // 월요일 5교시 수업이 있어도 4교시를 더하면 점심에서 끊겨 1 (3교시는 비어 있음)
  assert.equal(S.runWith('갑', 0, 4, 0), 1);
  // 2교시 수업을 빼고 3교시를 넣으면 1교시와 떨어져 1
  assert.equal(S.runWith('갑', 0, 3, 2), 1);
});

test('복무 시각과 겹치는 교시만 결강', () => {
  const away = makeAway({ from: '2026-10-19', to: '2026-10-19', t1: '13:30', t2: '16:30' });
  assert.equal(away('2026-10-19', 4), false);
  assert.equal(away('2026-10-19', 5), true);
  assert.equal(away('2026-10-19', 7), true);
  const { lessons } = awayLessons(S, '갑', { from: '2026-10-19', to: '2026-10-19', t1: '13:30', t2: '16:30' });
  assert.deepEqual(lessons.map(l => l.p), [5]);
});

test('교체 후보: 같은 반 또는 동교과, 오늘 이전·내 결강 시간 제외', () => {
  const r = { from: '2026-10-19', to: '2026-10-19', t1: '08:30', t2: '16:30' };
  const { away, lessons } = awayLessons(S, '갑', r);
  const first = lessons.find(l => l.p === 1);   // 월 1교시 1-1
  const c = S.candidates('갑', first, away, { today: D.today });
  assert.ok(c.swap.length > 0);
  for (const s of c.swap) {
    assert.ok(s.cls === '1-1' || FAM(s.subj) === '사회');
    assert.ok(s.date > D.today);
    assert.ok(!(s.date === '2026-10-19'));       // 결강일 전체가 자리 비움
    assert.ok(s.rA < 3 && s.rB < 3);
  }
  // 동교과(병)보다 같은 반(을) 후보가 먼저
  const firstSame = c.swap.findIndex(s => s.sameSub);
  if (firstSame > 0) assert.equal(c.swap[0].sameSub, false);
});

test('겹치지 않게 기본 교체를 고름', () => {
  const r = { from: '2026-10-19', to: '2026-10-19', t1: '08:30', t2: '16:30' };
  const { away, lessons } = awayLessons(S, '갑', r);
  lessons.forEach(l => (l.cand = S.candidates('갑', l, away, { today: D.today })));
  const picks = S.pickDefaults(lessons);
  const slots = picks.map((j, i) => (j >= 0 ? lessons[i].cand.swap[j].date + '-' + lessons[i].cand.swap[j].p : null)).filter(Boolean);
  assert.equal(new Set(slots).size, slots.length);
});

test('아침 안내 메시지: 야간자습 시간·대강 줄 없음, 교통·급식 시각 포함', () => {
  const msg = morningMsg('2026-10-21', { a1: '교사1', a2: '교사2', a3: '교사3', meal: '교사4', traffic: '교사5', night: '교사6' }, [], [{ time: '16:40', title: '교직원 연수', place: '시청각실' }]);
  assert.match(msg, /10월 21일\(수\)/);
  assert.match(msg, /교통지도 07:40~08:00/);
  assert.match(msg, /급식실 질서지도 12:20~12:40/);
  assert.match(msg, /야간자습 감독\n {2}교사6/);
  assert.doesNotMatch(msg, /18:40|대강/);
  assert.match(msg, /16:40 교직원 연수 \(시청각실\)/);
});
