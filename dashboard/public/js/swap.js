// 수업 변경 신청: 복무 시각과 겹치는 내 수업 → 맞바꿀 수업 추천 → 시간표 나란히 비교 → 신청 등록 / HWPX
import { $, $$, esc, api, toast, close, onOpenHook, radio, download, template, jszip } from './ui.js';
import { PT, makeAway, awayLessons } from './lib/schedule.js';
import { DOW, addDays, diff, dow, md, mdk, parse } from './lib/dates.js';
import { fillClassChange, toBlob, MAX_CHANGE_ROWS } from './lib/hwpx-fill.js';

export function initSwap(ctx) {
  const S = ctx.S;  // 신청은 학교 공식 시간표 기준
  let SW = [], ACT = 0;

  const teacherSel = $('#s-teacher');
  const names = Object.keys(ctx.D.tt).sort((a, b) => a.localeCompare(b));
  if (ctx.me.can.submitForOthers) { teacherSel.disabled = false; teacherSel.innerHTML = names.map(n => '<option>' + esc(n) + '</option>').join(''); }
  else teacherSel.innerHTML = '<option>' + esc(ctx.me.name) + '</option>';
  teacherSel.value = ctx.me.name;

  $('#s-t1').innerHTML = Object.entries(PT).map(([p, [a]]) => '<option value="' + a + '">' + a + ' (' + p + '교시 시작)</option>').join('');
  $('#s-t2').innerHTML = Object.entries(PT).map(([p, [, b]]) => '<option value="' + b + '">' + b + ' (' + p + '교시 끝)</option>').join('');
  $('#s-t1').value = PT[1][0]; $('#s-t2').value = PT[7][1];
  let next = addDays(ctx.today, 1); while (dow(next) % 6 === 0) next = addDays(next, 1);
  $('#s-from').value = next; $('#s-to').value = next;

  const range = () => { const from = $('#s-from').value, to = $('#s-to').value < from ? from : $('#s-to').value; return { from, to, t1: $('#s-t1').value, t2: $('#s-t2').value }; };
  const A = () => teacherSel.value;
  const alias = s => (A() === ctx.me.name ? ctx.alias(s) : s);

  function choice(l) {
    if (l.pick < 0) return null;
    const c = l.cand.swap[l.pick];
    return { who: c.B, date: c.date, p: c.p, subj: c.subj, cls: c.cls, sameSub: c.sameSub };
  }

  function render() {
    const r = range();
    if (!r.from) return;
    const { away, lessons } = awayLessons(S, A(), r);
    SW = lessons.map(l => Object.assign(l, { cand: S.candidates(A(), l, away, { today: ctx.today }) }));
    S.pickDefaults(SW).forEach((j, i) => { SW[i].pick = j; });
    $('#s-lessons').innerHTML = SW.length ? SW.map((l, i) => {
      const opts = l.cand.swap.slice(0, 12).map((c, j) => '<option value="' + j + '">' + (c.sameSub ? '동교과 · ' : '') + esc(c.B) + ' ' + mdk(c.date) + ' ' + c.p + '교시 ' + esc(c.cls) + ' ' + esc(c.subj) + '</option>');
      opts.push('<option value="-1">' + (l.cand.swap.length ? '직접 협의 (신청서에 비워 둠)' : '교체 가능한 수업 없음 · ' + (/^탐/.test(l.subj) ? '선택 블록 담당 교사와 직접 협의' : '수업계와 협의')) + '</option>');
      return '<div class="lesson"><div class="lh"><span>' + mdk(l.date) + ' ' + l.p + '교시 <b>' + esc(l.cls) + '</b> ' + esc(alias(l.subj)) + '</span><span class="cls-sub">교체 후보 ' + l.cand.swap.length + (l.cand.cut ? ' · 연강 제외 ' + l.cand.cut : '') + '</span></div>' +
        '<select data-li="' + i + '" aria-label="' + l.p + '교시 교체 수업">' + opts.join('') + '</select></div>';
    }).join('') : '<div class="empty">복무 시간과 겹치는 수업이 없음</div>';
    $$('#s-lessons select').forEach((el, i) => { el.value = String(SW[i].pick); });
    ACT = 0; checks(); paper(); compare();
  }

  function checks() {
    const { from } = range(), gap = diff(ctx.today, from), out = [];
    out.push(gap >= 1 ? ['ok', '최소 1일 전 결재 조건 충족 (' + gap + '일 전)'] : ['bad', '수업변경 신청서는 최소 1일 전까지 결재를 마쳐야 함']);
    const none = SW.filter(l => !choice(l)).length;
    if (none) out.push(['bad', '교체할 수업을 정하지 못한 결강 ' + none + '건: 직접 협의 필요']);
    else if (SW.length) out.push(['ok', '모든 결강 수업을 교체로 처리']);
    const used = SW.map(choice).filter(Boolean).map(c => c.date + '-' + c.p);
    if (new Set(used).size < used.length) out.push(['bad', '교체 수업 두 개가 같은 시간에 겹침. 다른 교체를 고르세요']);
    if (SW.length > MAX_CHANGE_ROWS) out.push(['warn', '신청서 계획표는 ' + MAX_CHANGE_ROWS + '줄까지 → HWPX를 두 장으로 나눠 받음']);
    $('#s-checks').innerHTML = out.map(([k, m]) => '<div class="chk ' + k + '">' + esc(m) + '</div>').join('');
  }

  // 나와 상대 시간표를 나란히: 빠지는 수업(빨간 점선), 새로 맡는 수업(초록)
  function grid(name, marks, days) {
    let h = '<table><thead><tr><th style="width:18px"></th>' + '월화수목금'.split('').map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>';
    for (let p = 1; p <= 7; p++) {
      h += '<tr><th>' + p + '</th>';
      for (let w = 0; w < 5; w++) {
        const m = marks[w + '-' + p], c = S.cellOf(name, w, p);
        let txt = c.c || c.s, cls = 'sj' + (days.includes(w) ? ' day' : ''), bg = ctx.subjColor(c.s);
        if (m) { cls += ' ' + m.kind; txt = m.text; if (m.kind === 'in') bg = ctx.subjColor(m.subj); }
        h += '<td class="' + cls + '"' + (bg ? ' style="background:' + bg + '"' : '') + ' title="' + esc((c.s + ' ' + c.c).trim()) + '">' + esc(txt) + '</td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }
  const dayLoad = (name, w, remove) => { let n = 0; for (let p = 1; p <= 7; p++) { const v = S.cellOf(name, w, p); if (v.s && v.s !== '창체' && p !== remove) n++; } return n + 1; };

  function compare() {
    const box = $('#s-compare'), l = SW[ACT];
    $$('#s-lessons .lesson').forEach((el, i) => el.classList.toggle('act', i === ACT));
    const c = l && choice(l); if (!c) { box.innerHTML = ''; return; }
    const B = c.who, w = dow(l.date) - 1, w2 = dow(c.date) - 1, same = c.date === l.date;
    const mA = { [w + '-' + l.p]: { kind: 'out', text: l.cls + ' →' }, [w2 + '-' + c.p]: { kind: 'in', text: '← ' + c.cls, subj: c.subj } };
    const mB = { [w + '-' + l.p]: { kind: 'in', text: '← ' + l.cls, subj: l.subj }, [w2 + '-' + c.p]: { kind: 'out', text: c.cls + ' →' } };
    const rB = S.runWith(B, w, l.p, same ? c.p : 0), rA = S.runWith(A(), w2, c.p, same ? l.p : 0);
    const head = (who, extra) => '<h5><span>' + esc(who) + '</span><span class="cls-sub">' + extra + '</span></h5>';
    box.innerHTML = '<div class="cmp-note">' + mdk(l.date) + ' ' + l.p + '교시 ' + esc(l.cls) + ' ↔ ' + mdk(c.date) + ' ' + c.p + '교시 ' + esc(c.cls) + (c.sameSub ? ' (동교과 교체: 서로의 반을 맡음)' : '') + '</div>' +
      '<div class="cmp-legend"><span class="lg out">빠지는 수업</span><span class="lg in">새로 맡는 수업</span><span class="lg dayc">바뀌는 요일</span></div>' +
      '<div class="cmp"><div>' + head('나 · ' + A(), mdk(c.date) + ' ' + dayLoad(A(), w2, same ? l.p : 0) + '시간 · 최장 연강 ' + rA) + grid(A(), mA, [w, w2]) + '</div>' +
      '<div>' + head('상대 · ' + B, mdk(l.date) + ' ' + dayLoad(B, w, same ? c.p : 0) + '시간 · 최장 연강 ' + rB) + grid(B, mB, [w, w2]) + '</div></div>';
  }

  function formRows() {
    return SW.map(l => {
      const c = choice(l) || {}, g = S.gradeOf(l.cls);
      return { date: l.date, grade: g || '', ban: /^\d-/.test(l.cls) ? l.cls.replace(/^\d-/, '') : l.cls, period: l.p, subj: alias(l.subj), toDate: c.date, toPeriod: c.p, toSubj: c.subj ? c.subj + (c.sameSub ? ' ' + c.cls : '') : '', who: c.who };
    });
  }

  function paper() {
    const r = range(), why = radio('s-why');
    const reasons = ['출장', '공가', '연가', '병가', '특별휴가', '조퇴', '외출', '기타'].map(x => (x === why ? '<b>■ ' + x + '</b>' : '□ ' + x)).join('  ');
    const fmtT = (d, t) => (parse(d).getUTCMonth() + 1) + '월 ' + parse(d).getUTCDate() + '일 ' + DOW[dow(d)] + '요일 ' + t.replace(':', '시 ') + '분';
    const days = SW.length ? new Set(SW.map(l => l.date)).size : diff(r.from, r.to) + 1;
    let rows = formRows().slice(0, MAX_CHANGE_ROWS).map(x => '<tr><td class="c">' + md(x.date) + '</td><td class="c">' + esc(x.grade) + '</td><td class="c">' + esc(x.ban) + '</td><td class="c">' + x.period + '</td><td class="c">' + esc(x.subj) + '</td><td class="c">' + (x.toDate ? md(x.toDate) : '') + '</td><td class="c">' + (x.toDate ? DOW[dow(x.toDate)] : '') + '</td><td class="c">' + (x.toPeriod || '') + '</td><td class="c">' + esc(x.toSubj) + '</td><td class="c">' + esc(x.who || '') + ' (인)</td></tr>').join('');
    for (let i = Math.min(SW.length, MAX_CHANGE_ROWS); i < 4; i++) rows += '<tr>' + '<td>&nbsp;</td>'.repeat(9) + '<td class="c b">(인)</td></tr>';
    $('#p-swap').innerHTML = '<table class="appr"><tr><td>수업계</td><td>부장</td><td>교감</td></tr><tr><td style="height:40px"></td><td></td><td></td></tr></table>' +
      '<h4>' + esc(((ctx.D.name || '').match(/^\d{4}학년도/) || [ctx.today.slice(0, 4) + '학년도'])[0]) + ' 수업변경 신청서</h4>' +
      '<p>* 결강교사 : <b>' + esc(A()) + '</b> (인)</p><p>* 변경 사유 : ' + reasons + '</p><p style="padding-left:12px">구체적 사유( ' + esc($('#s-detail').value) + ' )</p>' +
      '<p>* 나이스복무 신청일시 : ' + fmtT(r.from, r.t1) + '부터<br><span class="indent">' + fmtT(r.to, r.t2) + '까지 ( ' + days + ' )일</span></p>' +
      '<p>* 수업 교체 계획표</p><table><tr><th colspan="5">본 수업</th><th colspan="5">교체 수업</th></tr><tr><th>월 일</th><th>학년</th><th>반</th><th>교시</th><th>과목</th><th>월 일</th><th>요일</th><th>교시</th><th>과목</th><th>교사확인</th></tr>' + rows + '</table>' +
      '<p class="note">* 수업변경 원칙 : 수업변경 신청서는 본인이 작성하여 최소1일 전까지 결재를 완료하여야 하며, 수업변경은 교체를 원칙으로 한다.<br>* 수업변경 절차 : 나이스 복무신청 → (최소 1일전) 수업변경 신청서 수업계 제출 및 확인 → 나이스 복무 최종결재</p>';
  }

  $('#m-swap').addEventListener('change', e => {
    if (e.target.dataset.li !== undefined) { ACT = Number(e.target.dataset.li); SW[ACT].pick = Number(e.target.value); checks(); paper(); compare(); return; }
    if (['s-teacher', 's-from', 's-to', 's-t1', 's-t2'].includes(e.target.id)) render(); else { checks(); paper(); }
  });
  $('#m-swap').addEventListener('input', e => { if (e.target.id === 's-detail') paper(); });
  $('#s-lessons').addEventListener('focusin', e => { const i = e.target.dataset && e.target.dataset.li; if (i !== undefined && Number(i) !== ACT) { ACT = Number(i); compare(); } });

  $('#swapHwpx').addEventListener('click', async () => {
    try {
      const r = range(), rows = formRows(), tpl = await template('class-change.hwpx'), Z = jszip();
      const days = new Set(SW.map(l => l.date)).size || 1;
      const pages = Math.max(1, Math.ceil(rows.length / MAX_CHANGE_ROWS));
      for (let i = 0; i < pages; i++) {
        const zip = await fillClassChange(Z, tpl, { teacher: A(), reason: radio('s-why'), detail: $('#s-detail').value, ...r, days, rows: rows.slice(i * MAX_CHANGE_ROWS, (i + 1) * MAX_CHANGE_ROWS) });
        download(await toBlob(zip), '수업변경신청서_' + A() + '_' + r.from.slice(5).replace('-', '') + (pages > 1 ? '_' + (i + 1) : '') + '.hwpx');
      }
    } catch (e) { toast('HWPX 생성 실패: ' + e.message); }
  });

  $('#swapSubmit').addEventListener('click', async e => {
    const picked = SW.map(l => [l, choice(l)]).filter(([, c]) => c);
    if (!picked.length) { toast('등록할 교체가 없음'); return; }
    const used = picked.map(([, c]) => c.date + '-' + c.p);
    if (new Set(used).size < used.length) { toast('같은 시간에 겹치는 교체가 있음'); return; }
    const btn = e.currentTarget; btn.disabled = true;
    try {
      await api('subs', { method: 'POST', body: {
        absent: A(), reason: radio('s-why'), detail: $('#s-detail').value,
        rows: picked.map(([l, c]) => ({ date: l.date, p: l.p, cls: l.cls, subj: l.subj, toDate: c.date, toP: c.p, toCls: c.cls, toSubj: c.subj, who: c.who })),
      } });
      close('m-swap'); toast('신청 등록됨 · 수업계 확인 후 확정');
      await ctx.reloadSubs(); ctx.showSubs('next');
    } catch (err) { toast(err.message); }
    btn.disabled = false;
  });

  onOpenHook('m-swap', render);
}
