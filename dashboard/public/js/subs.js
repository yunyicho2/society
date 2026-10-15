// 대강·교체 현황 + 아침 안내 메시지(교무부장)
import { $, $$, esc, api, toast, copyText } from './ui.js';
import { mdk } from './lib/dates.js';

export function initSubs(ctx) {
  let SUBS = [];
  const canConfirm = ctx.me.can.confirmSubs;

  function table(rows, { actions = false } = {}) {
    if (!rows.length) return '<div class="empty">등록된 대강·교체 없음</div>';
    return '<div class="tbl-wrap"><table><thead><tr><th>날짜</th><th>교시</th><th>학급</th><th>과목</th><th>결강</th><th>담당</th><th>구분</th><th>상태</th></tr></thead><tbody>' +
      rows.map(r => {
        const mine = r.absent === ctx.me.name || r.who === ctx.me.name;
        let st = r.status === '확정' ? '<span class="badge b-ok">확정</span>'
          : r.status === '결재 대기' ? '<span class="badge b-warn">결재 대기</span>'
          : '<span class="badge">' + esc(r.status) + '</span>';
        if (r.status === '결재 대기' && r.id) {
          if (actions && canConfirm) st += ' <button class="mini" type="button" data-st="확정" data-id="' + esc(r.id) + '">확정</button><button class="mini" type="button" data-st="반려" data-id="' + esc(r.id) + '">반려</button>';
          else if (mine && (r.by === ctx.me.name || r.absent === ctx.me.name)) st += ' <button class="mini" type="button" data-st="취소" data-id="' + esc(r.id) + '">취소</button>';
        }
        return '<tr' + (mine ? ' class="mine"' : '') + '><td>' + mdk(r.date) + '</td><td>' + r.p + '</td><td>' + esc(r.cls) + '</td><td>' + esc(r.subj) + '</td><td>' + esc(r.absent) + (r.why ? ' (' + esc(r.why) + ')' : '') + '</td><td>' + esc(r.who) + '</td><td><span class="badge b-acc">' + esc(r.kind) + '</span></td><td>' + st + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function render() {
    const t = ctx.today, live = SUBS.filter(r => !['반려', '취소'].includes(r.status));
    const ev = ctx.S.eventsOn(t)[0];
    $('#subNotice').hidden = !ev; if (ev) $('#subNotice').textContent = '오늘은 ' + ev.label + (ev.note ? ' · ' + ev.note : '');
    $('#subToday').innerHTML = table(live.filter(r => r.date === t));
    $('#subNext').innerHTML = table(live.filter(r => r.date > t));
    $('#subWait').innerHTML = table(SUBS.filter(r => r.status === '결재 대기' && r.date >= t), { actions: true });
    const n = SUBS.filter(r => r.status === '결재 대기' && r.date >= t).length;
    const w = $('[data-seg="wait"]'); if (w) w.textContent = '결재 대기' + (n ? ' ' + n : '');
  }
  ctx.reloadSubs = async () => {
    try { SUBS = (await api('subs')).subs; render(); }
    catch (e) { $('#subToday').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  };
  ctx.showSubs = seg => { const b = $('[data-seg="' + seg + '"]'); if (b) b.click(); };

  $('#w-sub').addEventListener('click', async e => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    const st = b.dataset.st;
    if (st !== '확정' && !confirm('이 신청을 ' + st + '할까요? (같은 신청서의 줄이 모두 바뀜)')) return;
    b.disabled = true;
    try { await api('subs/status', { method: 'POST', body: { id: b.dataset.id, status: st } }); toast(st + ' 처리됨 · 학교 시트에 기록'); await ctx.reloadSubs(); }
    catch (err) { toast(err.message); b.disabled = false; }
  });
  $$('[data-seg]').forEach(b => b.addEventListener('click', () => {
    $$('[data-seg]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.seg; });
  }));
  ctx.reloadSubs();

  // 아침 안내 메시지: 서버가 교무부장에게만 내려줌
  if (ctx.me.can.morning) {
    $('#msgDate').value = ctx.today;
    $('#sheetLink').href = ctx.D.sheetUrl;
    const load = async () => {
      $('#msgText').textContent = '불러오는 중';
      try { $('#msgText').textContent = (await api('morning?date=' + ($('#msgDate').value || ctx.today))).text; }
      catch (e) { $('#msgText').textContent = e.message; }
    };
    $('#msgDate').addEventListener('change', load);
    $('#copyBtn').addEventListener('click', e => copyText($('#msgText').textContent, e.currentTarget));
    load();
  }
}
