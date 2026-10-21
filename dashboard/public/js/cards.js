// 머리 부분(날짜·D-day·날씨·검색)과 바로가기 카드(식단·일정·링크)
import { $, $$, esc, api, open } from './ui.js';
import { DOW, addDays, diff, dow, md, mdk, ymd } from './lib/dates.js';

export function initHeader(ctx) {
  const { D, today } = ctx;
  $('#todayLabel').innerHTML = esc(ymd(today)) + ' <span class="dow">' + DOW[dow(today)] + '요일</span>';
  const left = diff(today, D.examStart);
  if (left >= 0) { $('#ddayChip').textContent = D.examLabel + (left ? ' D-' + left : ' D-day'); $('#ddayChip').hidden = false; }
  const ev = ctx.S.eventsOn(today)[0];
  if (ev) {
    const n = diff(ev.s, today) + 1;
    $('#eventChip').textContent = ev.label + (ev.s !== ev.e ? ' ' + n + '일차' : '') + (ev.note ? ' · ' + ev.note : '');
    $('#eventChip').hidden = false;
  }
  $('#ttBadge').textContent = D.name ? D.name.replace(/^\d{4}학년도\s*/, '') + ' 시간표' : '전체 시간표';
  api('weather').then(w => {
    const icon = {
      sun: '<circle cx="12" cy="12" r="4.2" fill="var(--wx-sun)" stroke="var(--wx-sun)"/>',
      part: '<circle cx="9" cy="9" r="3.6" fill="var(--wx-sun)" stroke="var(--wx-sun)"/><path d="M8.5 19.5h9a3.6 3.6 0 0 0 .1-7.2 5 5 0 0 0-9.5 1.5 2.9 2.9 0 0 0 .4 5.7Z" fill="var(--surface)" stroke="var(--muted)"/>',
      rain: '<path d="M7.5 15.5h9a3.6 3.6 0 0 0 .1-7.2 5 5 0 0 0-9.5 1.5 2.9 2.9 0 0 0 .4 5.7Z" fill="var(--surface)" stroke="var(--muted)"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" stroke="var(--accent)"/>',
      snow: '<path d="M7.5 15.5h9a3.6 3.6 0 0 0 .1-7.2 5 5 0 0 0-9.5 1.5 2.9 2.9 0 0 0 .4 5.7Z" fill="var(--surface)" stroke="var(--muted)"/><path d="M9 19h.01M13 20h.01M17 19h.01" stroke="var(--accent)" stroke-width="2.4"/>',
    }[w.icon] || '<path d="M7.5 17.5h9a3.6 3.6 0 0 0 .1-7.2 5 5 0 0 0-9.5 1.5 2.9 2.9 0 0 0 .4 5.7Z" fill="var(--surface)" stroke="var(--muted)"/>';
    const bits = [esc(w.text), w.min + '°/' + w.max + '°'];
    if (w.rain != null && w.rain >= 30) bits.push('강수 ' + w.rain + '%');
    if (w.dust) bits.push('미세먼지 ' + esc(w.dust));
    $('#wxLine').innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true">' + icon + '</svg><b>' + w.temp + '°</b>' + bits.join(' · ');
    $('#wxLine').hidden = false;
  }).catch(() => {});
}

export function initLinks(ctx) {
  Object.entries(ctx.cfg.cards || {}).forEach(([key, card]) => {
    const t = $('[data-title="' + key + '"]'); if (t && card.title) t.textContent = card.title;
    const ul = $('#links-' + key); if (!ul) return;
    ul.innerHTML = (card.links || []).map(l => l.url
      ? '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + ' <span>›</span></a></li>'
      : '<li><span class="link-off" title="관리 › 카드 링크 바꾸기에서 주소를 넣으면 열림">' + esc(l.label) + ' <span>준비 중</span></span></li>').join('');
  });
}

export function initSchedule(ctx) {
  const { D, today } = ctx, ul = $('#schedList'), month = today.slice(0, 7);
  const items = [];
  ctx.S.eventsOn(today).forEach(e => items.push('<li class="ev-today"><b>오늘</b><span>' + esc(e.label) + (e.s !== e.e ? ' (' + md(e.s) + '~' + md(e.e) + ')' : '') + (e.note ? '<span class="sub">' + esc(e.note) + '</span>' : '') + '</span></li>'));
  (D.plans || []).filter(p => p.d === today).forEach(p => items.push('<li class="ev-today"><b>' + esc(p.time || '오늘') + '</b><span>' + esc(p.title) + '<span class="sub">' + esc([p.place, p.target, p.dept].filter(Boolean).join(' · ')) + '</span></span></li>'));
  (D.boss || []).filter(b => b.d === today).forEach(b => items.push('<li><b>' + esc(b.who) + '</b><span>' + esc(b.title) + (b.time ? '<span class="sub">' + esc(b.time) + '</span>' : '') + '</span></li>'));
  // 이번 달 남은 일정만 (학사일정 + 월중계획)
  const later = [];
  D.events.filter(e => e.s > today && e.s.slice(0, 7) === month).forEach(e => later.push([e.s, '<li><b>' + md(e.s) + '</b><span>' + esc(e.label) + (e.note ? '<span class="sub">' + esc(e.note) + '</span>' : '') + '</span></li>']));
  (D.plans || []).filter(p => p.d > today).forEach(p => later.push([p.d, '<li><b>' + md(p.d) + '</b><span>' + esc(p.title) + (p.place ? '<span class="sub">' + esc(p.place) + '</span>' : '') + '</span></li>']));
  later.sort((a, b) => a[0].localeCompare(b[0])).slice(0, 8).forEach(x => items.push(x[1]));
  ul.innerHTML = items.join('') || '<li class="note">이번 달 남은 일정 없음</li>';
}

export function initMeals(ctx) {
  const cache = {};
  let date = ctx.today;
  // 주말이면 다음 월요일 식단부터
  if (dow(date) === 6) date = addDays(date, 2); else if (dow(date) === 0) date = addDays(date, 1);
  const load = month => cache[month] || (cache[month] = api('meals?month=' + month).then(j => j.meals).catch(() => null));
  function html(m, kind) {
    if (m === null) return ['<li class="note">나이스 급식 정보를 불러오지 못함</li>', ''];
    const x = m && m[kind];
    if (!x || !Array.isArray(x.menu)) return ['<li class="note">' + esc((x && x.note) || (kind === '석식' ? '석식 없음' : '식단 없음')) + '</li>', ''];
    return [x.menu.map(([n, a]) => '<li>' + esc(n) + (a ? '<small>' + esc(a) + '</small>' : '') + '</li>').join(''), x.kcal ? x.kcal + ' kcal' : ''];
  }
  async function render() {
    $('#mealDate').textContent = mdk(date) + (date === ctx.today ? ' 오늘' : '');
    const all = await load(date.slice(0, 7));
    const day = all === null ? null : (all || {})[date];
    const [l, lk] = html(day, '중식'), [dn, dk] = html(day, '석식');
    $('#mealL').innerHTML = l; $('#kcalL').textContent = lk; $('#mealD').innerHTML = dn; $('#kcalD').textContent = dk;
  }
  $('#mealPrev').addEventListener('click', () => { date = addDays(date, dow(date) === 1 ? -3 : -1); render(); });
  $('#mealNext').addEventListener('click', () => { date = addDays(date, dow(date) === 5 ? 3 : 1); render(); });
  render();
}

// 검색: 메뉴 이름이면 바로 그 화면으로, 아니면 Google
const MENUS = [['시간표', '진도·차시 관리', '#w-prog'], ['수업 교체', '수업 변경 신청', 'm-swap'], ['수업변경', '수업 변경 신청', 'm-swap'], ['교체', '수업 변경 신청', 'm-swap'], ['대강', '대강·교체 현황', '#w-sub'],
  ['결석', '출결 서류 생성', 'm-attend'], ['체험학습', '출결 서류 생성', 'm-attend'], ['출결', '출결 서류 생성', 'm-attend'], ['규정', '규정 챗봇', 'chat'],
  ['당번', '아침 안내 메시지', '#w-msg'], ['감독', '아침 안내 메시지', '#w-msg'], ['공문', '공문 작성 도우미', 'm-doc'], ['기안', '공문 작성 도우미', 'm-doc'],
  ['성과급', '그 외 자료', 'm-more'], ['그 외 자료', '그 외 자료', 'm-more'], ['자료', '그 외 자료', 'm-more'], ['진도', '진도·차시 관리', '#w-prog'], ['차시', '진도·차시 관리', '#w-prog'],
  ['메모', '내 메모', '#w-notes'], ['설정', '내 설정', 'm-pref'], ['식단', '오늘의 식단', '[data-card="meal"]'], ['급식', '오늘의 식단', '[data-card="meal"]'], ['나이스', '나이스', 'https://use.neis.go.kr/'],
  ['에듀파인', 'K-에듀파인', 'https://klef.use.go.kr/keris_ui/login.do'], ['업무포털', '울산 업무포털', 'https://use.eduptl.kr/'], ['리로', '리로스쿨', 'https://hdhs.riroschool.kr/']];

export function initSearch() {
  const q = $('#q'), list = $('#suggList'); let items = [], sel = 0;
  function go(it) {
    list.hidden = true;
    if (it.google) { window.open('https://www.google.com/search?q=' + encodeURIComponent(it.text), '_blank', 'noopener'); return; }
    if (/^https:/.test(it.target)) { window.open(it.target, '_blank', 'noopener'); return; }
    if (/^[#[]/.test(it.target)) { const t = $(it.target); if (t && !t.hidden) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else open(it.target);
  }
  q.addEventListener('input', () => {
    const v = q.value.trim(); if (!v) { list.hidden = true; return; }
    const seen = new Set();
    items = MENUS.filter(m => m[0].includes(v) || m[1].includes(v)).filter(m => !seen.has(m[1]) && seen.add(m[1]))
      .filter(m => { const t = /^[#[]/.test(m[2]) ? $(m[2]) : null; return !t || !t.hidden; })
      .map(m => ({ label: m[1], hint: /^https:/.test(m[2]) ? '새 탭' : '바로가기', target: m[2] }));
    items.push({ label: '"' + v + '" Google 검색', hint: '새 탭', google: true, text: v }); sel = 0;
    list.innerHTML = '';
    items.forEach((it, i) => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = i === sel ? 'on' : ''; b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = it.label; b.lastChild.textContent = it.hint;
      b.addEventListener('click', () => go(it)); li.appendChild(b); list.appendChild(li);
    });
    list.hidden = false;
  });
  q.addEventListener('keydown', e => {
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      $$('button', list).forEach((b, i) => b.classList.toggle('on', i === sel));
    }
  });
  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    if (items[sel] && !list.hidden) go(items[sel]);
    else if (q.value.trim()) go({ google: true, text: q.value.trim() });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search-box')) list.hidden = true; });
}
