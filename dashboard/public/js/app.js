// 온라인 교무실 시작점: 로그인한 선생님 정보·학교 데이터·내 설정을 받아 각 화면을 그림
import { $, $$, esc, api, initModals } from './ui.js';
import { createSchedule } from './lib/schedule.js';
import { initPrefs } from './prefs.js';
import { initHeader, initLinks, initSchedule, initMeals, initSearch } from './cards.js';
import { initSubs } from './subs.js';
import { initProgress } from './prog.js';
import { initSwap } from './swap.js';
import { initForms } from './forms.js';
import { initChat, initDoc, initMore, initAdmin } from './tools.js';

async function main() {
  initModals();
  initSearch();
  let boot, cfg, prefs;
  try {
    [boot, cfg, prefs] = await Promise.all([
      api('bootstrap'),
      fetch('/config/dashboard.json', { cache: 'no-cache' }).then(r => r.json()),
      api('prefs'),
    ]);
  } catch (e) {
    $('#whoName').textContent = '';
    $('#bootError').textContent = e.message; $('#bootError').hidden = false;
    return;
  }

  const listeners = {};
  const ctx = {
    me: boot.me, cfg, today: boot.today,
    D: Object.assign({}, boot, cfg.term, { classGrade: cfg.classGrade || {} }),
    on: (name, fn) => (listeners[name] = listeners[name] || []).push(fn),
    emit: name => (listeners[name] || []).forEach(fn => fn()),
  };
  ctx.S = createSchedule(ctx.D);

  $('#whoName').textContent = ctx.me.name + ' 선생님';
  $('#whoRoles').innerHTML = ctx.me.roles.filter(r => r !== '교사').map(r => '<span class="badge b-acc">' + esc(r) + '</span>').join('');
  // 역할에 따라 보이는 것: data-cap="권한" 은 그 권한이 있을 때만, data-nocap 은 없을 때만
  $$('[data-cap]').forEach(el => { el.hidden = !ctx.me.can[el.dataset.cap]; });
  $$('[data-nocap]').forEach(el => { el.hidden = !!ctx.me.can[el.dataset.nocap]; });
  $('#widgets').classList.toggle('solo', !ctx.me.can.morning);
  if (!ctx.D.tt[ctx.me.name]) {
    $('#bootError').textContent = '전체 시간표에서 "' + ctx.me.name + '" 선생님을 찾지 못했어요. 권한 탭의 이름과 전체시간표 탭의 이름이 같은지 확인해 주세요.';
    $('#bootError').hidden = false;
  }

  initPrefs(ctx, prefs.prefs);
  initHeader(ctx);
  initLinks(ctx);
  initSchedule(ctx);
  initMeals(ctx);
  initSubs(ctx);
  initProgress(ctx);
  initSwap(ctx);
  initForms(ctx);
  initChat();
  initDoc();
  initMore();
  initAdmin(ctx);
}

main();
