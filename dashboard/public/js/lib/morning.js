// 아침 안내 메시지 (교무부장 전용 — 서버에서 권한 확인 후 만들어 보냄)
import { DOW, dow, md, parse } from './dates.js';

// duty: { 아침감독1, 아침감독2, 아침감독3, 야간자습, 토요오전, 토요오후, 급식, 교통 }
// events: 그 날 걸친 학사일정, plans: 월중계획 중 '아침 안내 포함' 체크된 것
export function morningMsg(date, duty, events = [], plans = []) {
  const t = parse(date), L = [];
  L.push('[' + (t.getUTCMonth() + 1) + '월 ' + t.getUTCDate() + '일(' + DOW[dow(date)] + ') 아침 안내]', '');
  if (!duty && !events.length && !plans.length) return L.concat(['당번표에 이 날짜가 없음. 학교 시트 당번표 탭을 확인하세요.']).join('\n');
  if (duty) {
    const r = duty;
    if (r.a1 || r.a2 || r.a3) L.push('■ 아침 감독', '  1학년 ' + (r.a1 || '-') + ' · 2학년 ' + (r.a2 || '-') + ' · 3학년 ' + (r.a3 || '-') + ' 선생님');
    if (r.meal) L.push('■ 급식실 질서지도 12:20~12:40', '  ' + r.meal + ' 선생님');
    if (r.traffic) L.push('■ 교통지도 07:40~08:00', '  ' + r.traffic + ' 선생님');
    if (r.night) L.push('■ 야간자습 감독', '  ' + r.night + ' 선생님');
    if (r.satAm || r.satPm) L.push('■ 토요 감독', '  오전 ' + (r.satAm || '-') + ' · 오후 ' + (r.satPm || '-') + ' 선생님');
  }
  if (events.length) {
    L.push('■ 학사일정');
    events.forEach(e => L.push('  ' + e.label + (e.s !== e.e ? ' (' + md(e.s) + '~' + md(e.e) + ')' : '') + (e.note ? ' · ' + e.note : '')));
  }
  if (plans.length) {
    L.push('■ 오늘 일정');
    plans.forEach(p => L.push('  ' + [p.time, p.title, p.place && '(' + p.place + ')', p.target && '· ' + p.target].filter(Boolean).join(' ')));
  }
  L.push('', '오늘도 수고 많으십니다.');
  return L.join('\n');
}
