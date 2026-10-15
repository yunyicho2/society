// 내 수업 · 진도·차시: 2차 범위는 모든 반 1차시부터, 최소 차시 반 기준
import { $, $$, esc, api, toast } from './ui.js';
import { createSchedule } from './lib/schedule.js';
import { addDays, dow, md, mdk } from './lib/dates.js';

export function initProgress(ctx) {
  const me = ctx.me.name;
  let NOTES = {}, editing = false, S = null;

  // 내가 고친 시간표 칸(내 설정에 저장)을 학교 시간표에 덮어씀 — 내 화면에서만
  function mySchedule() {
    const mine = Object.assign({}, ctx.D.tt[me] || {});
    Object.entries(ctx.P.tt || {}).forEach(([k, v]) => { if (v) mine[k] = v; else delete mine[k]; });
    S = createSchedule(Object.assign({}, ctx.D, { tt: Object.assign({}, ctx.D.tt, { [me]: mine }) }));
    return S;
  }
  const base = () => $('#baseDate').value || ctx.today;
  const end = () => ctx.P.end;
  const subjColor = s => (!s || s === '창체' || !(s in ctx.S.subjIndex)) ? '' : 'var(--s' + ctx.S.subjIndex[s] + ')';
  ctx.subjColor = subjColor;

  function groups() { return S.progressSummary(me, end(), ctx.P.untrack); }

  function progRows() {
    $('#progHint').textContent = '2차 범위 ' + mdk(ctx.D.rangeStart) + ' ~ ' + mdk(end()) + ' · 모든 반 1차시부터';
    let html = '', sum = '';
    groups().forEach(g => {
      const { subj, rows, min, max } = g;
      if (rows.length > 1) sum += '<div class="prog-sum"><b>' + esc(ctx.alias(subj)) + '</b> 최소 기준 <b>' + min + '차시</b> (' + esc(g.minClasses.join(', ')) + ')' +
        (max > min ? ' · 가장 많은 반 ' + esc(g.maxClasses.join(', ')) + ' ' + max + '차시 (+' + (max - min) + ')' : ' · 모든 반 같음') + '</div>';
      rows.forEach(r => {
        const n = r.dates.length, done = r.dates.filter(x => x.d < base()).length, extra = n - min;
        const tag = rows.length < 2 ? '' : n === max && max > min ? '<span class="badge b-acc">가장 많음</span>' : n === min && max > min ? '<span class="badge b-warn">가장 적음</span>' : '';
        html += '<tr><td>' + esc(r.cls) + ' ' + esc(ctx.alias(r.subj)) + '<br><span class="mini-meter"><i style="width:' + (n ? Math.round(done / n * 100) : 0) + '%"></i></span></td>' +
          '<td>' + done + '차시</td><td><b>' + n + '</b>차시</td><td>' + (rows.length < 2 ? '-' : extra ? '+' + extra + ' 복습·보충' : '기준') + '</td><td>' + tag + '</td></tr>';
      });
    });
    $('#progSum').innerHTML = sum;
    $('#progBody').innerHTML = html || '<tr><td colspan="5">시간표에 수업이 없음</td></tr>';
  }

  function todayBox() {
    const seq = S.lessonSeq(me, end(), ctx.P.untrack);
    const idx = l => { const r = seq.find(x => x.subj === l.subj && x.cls === l.cls); if (!r) return 0; return r.dates.findIndex(x => x.d === l.date && x.p === l.p) + 1; };
    const b = base(), ls = S.lessonsOn(me, b), live = ls.filter(l => !l.off);
    $('#todayHead').textContent = mdk(b) + ' 수업';
    let html = '';
    const ev = S.eventsOn(b);
    if (!live.length) {
      html += '<div class="notice">' + (ev.length ? esc(ev[0].label) + ' · 수업 없음' : (dow(b) % 6 === 0 ? '주말' : '이 날은 수업 없음')) + '</div>';
      for (let d = addDays(b, 1), n = 0; n < 40; d = addDays(d, 1), n++) {
        const l2 = S.lessonsOn(me, d).filter(l => !l.off);
        if (l2.length) { html += '<p class="cls-sub">다음 수업: ' + mdk(d) + ' ' + l2.map(l => l.p + '교시 ' + esc(l.cls) + (idx(l) ? ' ' + idx(l) + '차시' : '')).join(', ') + '</p>'; break; }
      }
    } else {
      html += '<ul class="check">' + live.map(l => {
        const k = idx(l), note = k && (NOTES[l.subj] || [])[k - 1];
        return '<li><label><input type="checkbox"><span class="p">' + l.p + '교시 ' + esc(l.cls) + '</span><span class="tx">' + esc(ctx.alias(l.subj)) + (k ? ' · ' + k + '차시' : '') + (note && note.unit ? ' · ' + esc(note.unit) : '') + '</span></label></li>';
      }).join('') + '</ul>';
      const offs = ls.filter(l => l.off);
      if (offs.length) html += '<p class="cls-sub">학사일정으로 빠지는 수업: ' + offs.map(l => l.p + '교시 ' + esc(l.cls)).join(', ') + '</p>';
    }
    $('#todayBox').innerHTML = html;
  }

  function ttTable() {
    const bw = dow(base()) - 1, school = ctx.D.tt[me] || {};
    let h = '<thead><tr><th>교시</th>' + '월화수목금'.split('').map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>';
    for (let p = 1; p <= 7; p++) {
      h += '<tr><th>' + p + '</th>';
      for (let w = 0; w < 5; w++) {
        const k = w + '-' + p, c = S.cellOf(me, w, p), bg = subjColor(c.s);
        const changed = k in (ctx.P.tt || {}) && (ctx.P.tt[k] || '') !== (school[k] || '');
        h += '<td class="ed sj' + (w === bw ? ' now-cell' : '') + (changed ? ' changed' : '') + '" data-k="' + k + '"' + (bg ? ' style="background:' + bg + '"' : '') + '>' + esc(c.c ? ctx.alias(c.s) + ' ' + c.c : c.s) + '</td>';
      }
      h += '</tr>';
    }
    $('#ttTable').innerHTML = h + '</tbody>';
  }

  function planTable() {
    const G = groups(), keys = G.map(g => g.subj), sel = $('#planSubj');
    const cur = keys.includes(sel.value) ? sel.value : (G.slice().sort((a, b) => b.rows.length - a.rows.length)[0] || {}).subj || '';
    sel.innerHTML = keys.map(k => '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>' + esc(ctx.alias(k)) + '</option>').join('');
    const g = G.find(x => x.subj === cur); if (!g) { $('#planTable').innerHTML = '<tbody><tr><td>진도 관리할 수업이 없음</td></tr></tbody>'; return; }
    const notes = NOTES[cur] || [], b = base();
    let h = '<thead><tr><th>차시</th><th>단원</th><th>학습 내용</th>' + g.rows.map(r => '<th>' + esc(r.cls) + '</th>').join('') + '</tr></thead><tbody>';
    for (let k = 1; k <= g.max; k++) {
      const n = notes[k - 1] || {};
      h += '<tr class="' + (k > g.min ? 'extra' : '') + '"><td>' + k + (k === g.min ? '<br><span class="cls-sub">최소 기준</span>' : '') + '</td>' +
        '<td class="ed" data-f="unit">' + esc(n.unit || '') + '</td><td class="ed" data-f="content">' + esc(n.content || '') + '</td>' +
        g.rows.map(r => { const x = r.dates[k - 1]; return '<td class="' + (x && x.d < b ? 'past' : '') + '">' + (x ? md(x.d) + ' ' + x.p + '교시' : '—') + '</td>'; }).join('') + '</tr>';
    }
    $('#planTable').innerHTML = h + '</tbody>';
  }

  function render() { mySchedule(); progRows(); todayBox(); ttTable(); planTable(); setEditing(false); }

  // 편집: 내 시간표 칸 / 차시 진도표 단원·내용
  const editBtn = $('#editBtn');
  const tab = () => ($('[data-tab][aria-selected="true"]') || {}).dataset?.tab;
  function setEditing(on) {
    editing = on; $('#w-prog').classList.toggle('editing', on);
    $$('#w-prog td.ed').forEach(td => { td.contentEditable = on ? 'true' : 'false'; });
    editBtn.textContent = on ? '저장' : '편집'; editBtn.classList.toggle('ghost', !on);
  }
  function parseCell(text) {
    const v = text.replace(/\s+/g, ' ').trim(); if (!v) return '';
    const i = v.lastIndexOf(' ');
    let subj = i > 0 ? v.slice(0, i) : v; const cls = i > 0 ? v.slice(i + 1) : '';
    const back = Object.entries(ctx.P.alias).find(([, a]) => a === subj); if (back) subj = back[0];
    return subj + '|' + cls;
  }
  async function save() {
    if (tab() === 't-tt') {
      const school = ctx.D.tt[me] || {};
      $$('#ttTable td[data-k]').forEach(td => {
        const k = td.dataset.k, v = parseCell(td.textContent);
        if (v === (school[k] || '')) delete ctx.P.tt[k]; else ctx.P.tt[k] = v;
      });
      ctx.savePrefs(); toast('내 시간표에 반영 · 학교 전체 시간표는 그대로');
    } else if (tab() === 't-plan') {
      const subj = $('#planSubj').value, rows = [];
      $$('#planTable tbody tr').forEach(tr => rows.push({ unit: (tr.querySelector('[data-f="unit"]') || {}).textContent?.trim() || '', content: (tr.querySelector('[data-f="content"]') || {}).textContent?.trim() || '' }));
      while (rows.length && !rows[rows.length - 1].unit && !rows[rows.length - 1].content) rows.pop();
      try { await api('progress', { method: 'PUT', body: { subj, rows } }); NOTES[subj] = rows; toast('내 계정에 저장됨'); }
      catch (e) { toast('저장 실패: ' + e.message); return; }
    }
    render();
  }
  editBtn.addEventListener('click', () => { if (editing) save(); else setEditing(true); });
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
    if (editing) render();
    $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $$('.tabpane').forEach(p => { p.hidden = p.id !== b.dataset.tab; });
    editBtn.hidden = b.dataset.tab === 't-now';
  }));
  $('#w-prog').addEventListener('input', e => { if (e.target.closest('table.tt')) e.target.classList.add('changed'); });
  $('#w-prog').addEventListener('keydown', e => { if (editing && e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); } });
  $('#planSubj').addEventListener('change', planTable);
  $('#baseDate').value = ctx.today;
  $('#baseDate').addEventListener('change', render);
  ctx.on('prefs', render);

  render();
  api('progress').then(j => { NOTES = j.notes || {}; todayBox(); planTable(); }).catch(() => {});
}
