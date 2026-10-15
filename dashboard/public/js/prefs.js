// 내 설정: 서버(D1)에 선생님별로 저장. 바뀌면 'prefs' 이벤트로 다른 화면을 다시 그림
import { $, $$, esc, api, toast, onOpenHook } from './ui.js';
import { mdk } from './lib/dates.js';

export const CARDS = [['meal', '오늘의 식단'], ['sched', '오늘의 일정'], ['base', '우리학교 기초자료'], ['drive', '공유 드라이브'], ['portal', '업무포털'],
  ['t-chat', '도구 · 규정 챗봇'], ['t-attend', '도구 · 출결 서류 생성'], ['t-doc', '도구 · 공문 작성 도우미'], ['t-swap', '도구 · 수업 변경 신청'], ['t-prog', '도구 · 진도·차시 관리'],
  ['w-sub', '대강·교체 현황'], ['w-prog', '내 수업 · 진도·차시']];
const QUICK = ['meal', 'sched', 'base', 'drive', 'portal'];

export function initPrefs(ctx, saved) {
  const P = ctx.P = Object.assign({}, saved);
  const fix = () => {
    P.hide = Array.isArray(P.hide) ? P.hide : [];
    P.order = Array.isArray(P.order) && P.order.length === QUICK.length && QUICK.every(k => P.order.includes(k)) ? P.order : QUICK.slice();
    P.alias = P.alias && typeof P.alias === 'object' ? P.alias : {};
    P.untrack = Array.isArray(P.untrack) ? P.untrack : [];
    P.links = Array.isArray(P.links) ? P.links : [];
    P.tt = P.tt && typeof P.tt === 'object' ? P.tt : {};
    P.end = /^\d{4}-\d{2}-\d{2}$/.test(P.end || '') ? P.end : ctx.D.progressEnd;
    P.home = typeof P.home === 'string' ? P.home : '';
    P.theme = ['light', 'dark'].includes(P.theme) ? P.theme : '';
  };
  fix();
  ctx.alias = s => P.alias[s] || s;

  let timer = 0;
  ctx.savePrefs = () => {
    clearTimeout(timer);
    $('#prefSaved').textContent = '저장 중…';
    timer = setTimeout(async () => {
      try { await api('prefs', { method: 'PUT', body: { prefs: P } }); $('#prefSaved').textContent = '내 계정에 저장됨'; }
      catch (e) { $('#prefSaved').textContent = ''; toast('설정 저장 실패: ' + e.message); }
    }, 500);
  };

  function apply() {
    $$('[data-card]').forEach(el => el.toggleAttribute('data-off', P.hide.includes(el.dataset.card)));
    P.order.forEach((k, i) => { const el = $('[data-card="' + k + '"]'); if (el) el.style.order = i; });
    $('#myLinks').innerHTML = P.links.map(l => '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + ' <span>›</span></a></li>').join('');
    $('#progBadge').textContent = '진도 마무리 ' + mdk(P.end) + (P.end !== ctx.D.progressEnd ? ' · 내 설정' : '');
    $('#progToolBadge').textContent = mdk(P.end) + ' 진도 마무리';
    if (P.theme) document.documentElement.dataset.theme = P.theme; else delete document.documentElement.dataset.theme;
  }

  function form() {
    $('#prefWho').textContent = ctx.me.name + ' 선생님 설정 · 이 계정에만 저장되고 다른 선생님 화면은 바뀌지 않음';
    const order = P.order.concat(CARDS.map(c => c[0]).filter(k => !QUICK.includes(k)));
    $('#prefCards').innerHTML = order.map(k => {
      const c = CARDS.find(x => x[0] === k); if (!c) return '';
      return '<li><label><input type="checkbox" data-show="' + k + '"' + (P.hide.includes(k) ? '' : ' checked') + '>' + esc(c[1]) + '</label>' +
        (QUICK.includes(k) ? '<button class="mini" type="button" data-mv="' + k + '" data-d="-1" aria-label="위로">↑</button><button class="mini" type="button" data-mv="' + k + '" data-d="1" aria-label="아래로">↓</button>' : '') + '</li>';
    }).join('');
    $('#prefEnd').value = P.end;
    $('#prefHome').value = P.home;
    const rows = ctx.S.remaining(ctx.me.name, ctx.D.rangeStart, ctx.D.lastDay);
    $('#prefTrack').innerHTML = rows.map(r => { const k = r.subj + ' ' + r.cls; return '<label><input type="checkbox" data-track="' + esc(k) + '"' + (P.untrack.includes(k) ? '' : ' checked') + '>' + esc(r.cls + ' ' + ctx.alias(r.subj)) + '</label>'; }).join('') || '<span class="cls-sub">시간표에 내 수업이 없음 (권한 탭 이름과 시간표 이름이 같은지 확인)</span>';
    const subs = [...new Set(rows.map(r => r.subj))];
    $('#prefAlias').innerHTML = subs.map(s => '<label class="alias-row"><span>' + esc(s) + '</span><input type="text" maxlength="20" data-alias="' + esc(s) + '" value="' + esc(P.alias[s] || '') + '" placeholder="' + esc(s) + '"></label>').join('');
    $$('input[name="prefTheme"]').forEach(i => { i.checked = i.value === P.theme; });
    $('#prefLinks').innerHTML = P.links.map((l, i) => '<div class="link-row"><span>' + esc(l.name) + '</span><button class="mini" type="button" data-unlink="' + i + '">삭제</button></div>').join('') || '<span class="cls-sub">추가한 바로가기 없음</span>';
  }

  function changed() { ctx.savePrefs(); apply(); ctx.emit('prefs'); form(); }

  $('#m-pref').addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.show) { P.hide = P.hide.filter(k => k !== el.dataset.show); if (!el.checked) P.hide.push(el.dataset.show); }
    else if (el.dataset.track) { P.untrack = P.untrack.filter(k => k !== el.dataset.track); if (!el.checked) P.untrack.push(el.dataset.track); }
    else if (el.dataset.alias) { if (el.value.trim()) P.alias[el.dataset.alias] = el.value.trim(); else delete P.alias[el.dataset.alias]; }
    else if (el.id === 'prefEnd') P.end = el.value || ctx.D.progressEnd;
    else if (el.id === 'prefHome') { const v = el.value.trim(); if (v && !/^[123]-\d{1,2}$/.test(v)) { toast('담임 학급은 1-5 처럼 적어 주세요'); return; } P.home = v; }
    else if (el.name === 'prefTheme') P.theme = el.value;
    else return;
    changed();
  });
  $('#m-pref').addEventListener('click', e => {
    const mv = e.target.closest('[data-mv]'), un = e.target.closest('[data-unlink]');
    if (mv) {
      const i = P.order.indexOf(mv.dataset.mv), j = i + Number(mv.dataset.d);
      if (j < 0 || j >= P.order.length) return;
      [P.order[i], P.order[j]] = [P.order[j], P.order[i]]; changed();
    } else if (un) { P.links.splice(Number(un.dataset.unlink), 1); changed(); }
    else if (e.target.id === 'plAdd') {
      const name = $('#plName').value.trim(), url = $('#plUrl').value.trim();
      if (!name || !/^https?:\/\//.test(url)) { toast('이름과 https:// 로 시작하는 주소를 넣어 주세요'); return; }
      if (P.links.length >= 20) { toast('바로가기는 20개까지'); return; }
      P.links.push({ name, url }); $('#plName').value = ''; $('#plUrl').value = ''; changed();
    } else if (e.target.id === 'prefReset') {
      Object.keys(P).forEach(k => delete P[k]); fix(); changed(); toast('기본값으로 돌림');
    }
  });
  onOpenHook('m-pref', form);
  apply();
}
