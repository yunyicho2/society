// 출결 서류: 결석 신고서(HWPX), 체험학습 신청서·결과보고서(인쇄), 월별 출결 확인현황(나이스 엑셀 → 인쇄)
// 학생 정보는 이 화면 메모리에만 있고 서버로 보내지 않음
import { $, $$, esc, toast, radio, download, template, jszip, onOpenHook } from './ui.js';
import { addDays, diff, dow, mdk, parse } from './lib/dates.js';
import { fillAbsence, toBlob } from './lib/hwpx-fill.js';
import { readXlsx } from './lib/xlsx-read.js';
import { parseAttendance } from './lib/neis-attendance.js';

export function initForms(ctx) {
  const v = id => $('#' + id).value;
  const blank = (s, w) => (s ? esc(s) : '<span class="b">' + '&nbsp;'.repeat(w || 8) + '</span>');
  const kd = s => { if (!s) return '　년 　월 　일'; const t = parse(s); return t.getUTCFullYear() + '년 ' + (t.getUTCMonth() + 1) + '월 ' + t.getUTCDate() + '일'; };
  const home = () => { const m = /^([123])-(\d{1,2})$/.exec(ctx.P.home || ''); return m ? { g: m[1], b: m[2] } : { g: '', b: '' }; };
  const homeTxt = () => { const h = home(); return h.g ? h.g + '학년 ' + h.b + '반' : '　학년 　반'; };
  const year = ctx.today.slice(0, 4);
  // 수업일수 (주말·학사일정상 전 교시 없는 날 제외)
  function schoolDays(a, b) {
    if (!a || !b) return 0; let n = 0;
    for (let d = a; d <= b; d = addDays(d, 1)) { if (dow(d) % 6 === 0) continue; if ([1, 2, 3, 4, 5, 6, 7].every(p => ctx.S.noClass(d, null, p)) && ctx.S.eventsOn(d).some(e => /성탄|공휴|휴업|재량/.test(e.label))) continue; n++; }
    return n;
  }
  let MONTH_ROWS = [];

  function pAbs() {
    const from = v('a-from'), to = v('a-to') < from ? from : v('a-to'), n = schoolDays(from, to), h = home();
    const att = $$('#a-att input').map(i => i.value + ' (' + (i.checked ? ' ○ ' : '　') + ')').join('  ');
    const how = radio('a-how'), kind = radio('a-kind');
    $('#p-abs').innerHTML = '<h4>결석 ( ' + ['질병', '인정', '기타'].map(k => (k === kind ? '<b>' + k + '</b>' : '<span class="b">' + k + '</span>')).join('·') + ' ) 신고서</h4>' +
      '<p>학 번 : 제 ' + blank(h.g, 2) + ' 학년 ' + blank(h.b, 2) + ' 반 ' + blank(v('a-no'), 3) + ' 번<br>성 명 : ' + blank(v('a-name')) + '</p><p>본인은 다음과 같이 결석 하였(겠)기에 보호자 연서로 신고합니다.</p>' +
      '<table><tr><th style="width:70px">기 간</th><td>' + kd(from) + '부터 ' + kd(to) + '까지 ( ' + n + ' )일간</td></tr><tr><th>사 유</th><td>' + blank(v('a-why'), 20) + '</td></tr><tr><th>붙 임</th><td>' + att + '</td></tr></table>' +
      '<p class="note">* 법적근거에 의한(교육기본법 제23조의3 등 수집근거 참조) 정보 수집으로 별도 동의를 받을 필요가 없음.</p>' +
      '<p class="c">' + year + '년 　 월 　 일</p><p class="sign">본 인 : ' + blank(v('a-name')) + ' (인)<br>보호자 : ' + blank('', 10) + ' (인)</p><p class="to">' + esc(ctx.cfg.school.name) + '장 귀하</p><hr>' +
      '<h5>담 임 교 사 확 인 서</h5><table><tr><th style="width:70px">확인일시</th><td>' + year + '년 　 월 　 일</td></tr><tr><th>확인방법</th><td>' + ['보호자와 전화연락', '학부모내교', '기타'].map(x => x + '( ' + (x === how ? '○' : '　') + ' )').join('  ') + '</td></tr><tr><th>확인내용</th><td>' + blank(v('a-why'), 20) + '</td></tr></table>' +
      '<p>위와 같이 확인 하였습니다.</p><p class="sign">학급담임 : ' + esc(ctx.me.name) + ' (인)</p>';
  }

  function tripChecks() {
    const from = v('t-from'), to = v('t-to') < from ? from : v('t-to'), days = Number(v('t-days')) || 0, used = Number(v('t-used')) || 0, out = [];
    if (!from) { $('#t-checks').innerHTML = ''; return; }
    const lead = diff(ctx.today, from);
    out.push(lead >= 3 ? ['ok', '시작일 3일 이전 제출 조건 충족 (' + lead + '일 전)'] : ['bad', '신청서는 신청기간 시작일 3일 이전에 제출해야 함 (지금 ' + lead + '일 전)']);
    out.push(used + days <= 7 ? ['ok', '이번 학기 누적 ' + (used + days) + '일 / 학기당 7일'] : ['bad', '학기당 허용일수 7일 초과 (누적 ' + (used + days) + '일)']);
    if (schoolDays(from, to) >= 5) out.push(['warn', '연속 5일 이상: 주 1회 이상 담임 연락 서약 필요']);
    if ((days * 2) % 1) out.push(['bad', '인정결석은 0.5일 단위로만 신청 가능']);
    out.push(['ok', '결과보고서 제출 기한: ' + mdk(addDays(to, 7)) + ' (종료일 7일 이내, 휴일 포함)']);
    $('#t-checks').innerHTML = out.map(([k, m]) => '<div class="chk ' + k + '">' + esc(m) + '</div>').join('');
  }
  const KINDS = ['체험활동', '친·인척 방문', '가족동반여행', '기타', '고적답사 및 향토행사 참여', '가정학습'];
  const kindLine = sel => KINDS.map(k => '∘' + (k === '가정학습' ? '감염병 심각·경계단계로 인한 가정학습' : k) + '( ' + (k === sel ? 'O' : '　') + ' )').join(' ');
  function pTrip() {
    const from = v('t-from'), to = v('t-to') < from ? from : v('t-to'), days = v('t-days'), used = Number(v('t-used')) || 0;
    const g = blank(v('t-gname')), rel = blank(v('t-grel'), 3), same = $('#t-same').checked, who = homeTxt() + ' ' + blank(v('t-no'), 2) + '번';
    const per = kd(from) + ' ~ ' + kd(to) + ' (인정결석 ' + esc(days) + '일)';
    $('#p-trip').innerHTML = '<h4>「학교장 허가 교외체험학습」 신청서</h4><table>' +
      '<tr><th>학생 성명</th><td>' + blank(v('t-name')) + '</td><th>학년/반/번호</th><td>' + who + '</td></tr>' +
      '<tr><th>신청기간</th><td colspan="3">' + per + '</td></tr><tr><th>교외체험학습<br>허용일수</th><td colspan="3">학기당 7일</td></tr>' +
      '<tr><th>활동 구분</th><td colspan="3">' + kindLine(radio('t-kind')) + '</td></tr><tr><th>목적지</th><td colspan="3">' + blank(v('t-dest')) + '</td></tr>' +
      '<tr><th>(숙박 시)<br>숙박 장소</th><td colspan="3">' + blank(v('t-stay')) + '</td></tr>' +
      '<tr><th>보호자명</th><td>' + g + ' (관계: ' + rel + ')</td><th>인솔자명</th><td>' + (same ? g + ' (관계: ' + rel + ')' : blank('')) + '</td></tr>' +
      '<tr><th>목 적</th><td colspan="3">' + blank(v('t-purpose')) + '</td></tr><tr><th>체험학습<br>내용</th><td colspan="3">' + esc(v('t-content')).replace(/\n/g, '<br>') + '</td></tr>' +
      '<tr><th>서 약</th><td colspan="3">연속 5일 이상 교외체험학습(가정학습 포함) 시 학생은 주 1회 이상 담임교사와 연락하여 안전, 건강을 확인시키겠습니다. (동의함 □)</td></tr></table>' +
      '<p class="sign">학생 : ' + blank(v('t-name')) + ' (인)<br>보호자 : ' + g + ' (인)</p><p class="to">' + esc(ctx.cfg.school.name) + '장 귀하</p>' +
      '<hr><h5>「학교장 허가 교외체험학습」 통보서 (담임 작성)</h5><table><tr><th>학생 성명</th><td>' + blank(v('t-name')) + '</td><th>학년/반/번호</th><td>' + who + '</td></tr>' +
      '<tr><th>금회까지<br>누적 사용기간</th><td colspan="3">이번 학기 ( ' + (used + (Number(days) || 0)) + ' )일</td></tr><tr><th>신청기간</th><td colspan="3">' + per + '</td></tr><tr><th>허가기간</th><td colspan="3">' + per + '</td></tr></table>' +
      '<p>위와 같이 허가 처리되었음을 알려 드립니다.</p><p class="sign">' + esc(ctx.cfg.school.name) + ' ' + homeTxt() + ' 담임교사 : ' + esc(ctx.me.name) + ' (인)<br>보호자님 귀하</p>' +
      '<p class="note">※ 보호자가 신청서를 제출하였다 하여 체험학습이 허가된 것이 아니며 담임교사로부터 반드시 최종 허가 여부 통보서(또는 문자)를 받은 후 실시해야 함.<br>※ 신청서는 신청기간 시작일 3일 이전에 제출하고, 결과보고서는 신청기간 종료일 7일 이내(휴일 포함)에 제출해야 함.</p>';
    tripChecks();
  }
  function pRep() {
    const from = v('r-from'), to = v('r-to') < from ? from : v('r-to');
    $('#p-rep').innerHTML = '<h4>「학교장 허가 교외체험학습」 결과보고서</h4><table>' +
      '<tr><th>학생 성명</th><td>' + blank(v('r-name')) + '</td><th>학년/반/번호</th><td>' + homeTxt() + ' ' + blank(v('r-no'), 2) + '번</td></tr>' +
      '<tr><th>교외체험학습 기간</th><td colspan="3">' + kd(from) + ' ~ ' + kd(to) + ' (인정결석 ' + esc(v('r-days')) + '일)</td></tr>' +
      '<tr><th>교외체험학습 장소</th><td colspan="3">' + blank(v('r-place')) + '</td></tr><tr><th>활동 구분</th><td colspan="3">' + kindLine(radio('t-kind')) + '</td></tr>' +
      '<tr><th>제 목</th><td colspan="3">' + blank(v('r-title')) + '</td></tr><tr><td colspan="4" style="height:90px;vertical-align:top">' + esc(v('r-body')).replace(/\n/g, '<br>') + '</td></tr>' +
      '<tr><td colspan="4">첨부 : 사진 ' + esc(v('r-photo')) + ' 장, 항공권 ' + esc(v('r-ticket')) + ' 매 등</td></tr></table>' +
      '<p>위와 같이 「학교장 허가 교외체험학습」 결과보고서를 제출합니다.</p><p class="c">' + year + '. 　 . 　 .</p><p class="sign">학생 : ' + blank(v('r-name')) + ' (인)<br>보호자 : ' + blank('') + ' (인)</p><p class="to">' + esc(ctx.cfg.school.name) + '장 귀하</p>' +
      '<p class="note">※ 학교장 허가 교외체험학습 결과보고서는 신청기간 종료일 7일 이내(휴일 포함)에 제출해야 함.</p>';
    if (to) { const due = addDays(to, 7), left = diff(ctx.today, due); $('#r-checks').innerHTML = '<div class="chk ' + (left >= 0 ? 'ok' : 'bad') + '">제출 기한 ' + mdk(due) + (left >= 0 ? ' · ' + left + '일 남음' : ' · 기한 지남') + '</div>'; }
  }
  function pMonth() {
    const m = v('m-month'), h = home();
    const rows = MONTH_ROWS.length ? MONTH_ROWS.map(r => '<tr>' + [r.no, r.name, r.kind, r.act, r.reason, r.day, r.dow, r.period].map(c => '<td class="c">' + esc(c) + '</td>').join('') + '<td></td></tr>').join('')
      : '<tr><td colspan="9" class="c">나이스 출결 엑셀을 고르면 이 달의 지각·조퇴·결과·미인정이 채워짐</td></tr>';
    $('#p-month').innerHTML = '<table class="appr"><tr><td>결/재</td><td>담임</td><td>학년부장</td></tr><tr><td></td><td style="height:34px"></td><td></td></tr></table>' +
      '<h4>' + year + '학년도 ( ' + esc(m) + ' )월 출결 확인현황 (지각, 조퇴, 결과, 미인정)</h4><p class="r">( ' + esc(h.g || '　') + ' ) 학년 ( ' + esc(h.b || '　') + ' ) 반 　 담임 : ' + esc(ctx.me.name) + '</p>' +
      '<table><tr><th>번호</th><th>이름</th><th>유형</th><th>출결</th><th>내용</th><th>일</th><th>요일</th><th>교시</th><th>학생확인(서명)</th></tr>' + rows + '</table>';
  }

  function renderForms() { pAbs(); pTrip(); pRep(); pMonth(); }
  const activeTab = () => ($('[data-ftab][aria-selected="true"]') || {}).dataset.ftab;
  function syncButtons() {
    const t = activeTab();
    $('#hwpxBtn').hidden = t !== 'f-abs';
    $('#formNote').textContent = t === 'f-abs' ? '학교 양식 HWPX에 바로 채움' : '이 양식은 인쇄·PDF로 받기 (HWPX 양식은 추후 연결)';
  }

  // 기본값: 오늘·담임 학급
  [['a-from', ctx.today], ['a-to', ctx.today], ['t-from', addDays(ctx.today, 4)], ['t-to', addDays(ctx.today, 4)], ['r-from', ctx.today], ['r-to', ctx.today]].forEach(([id, d]) => { $('#' + id).value = d; });
  const nowM = Number(ctx.today.slice(5, 7));
  $('#m-month').innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(m => '<option' + (m === nowM ? ' selected' : '') + '>' + m + '</option>').join('');

  $('#m-attend').addEventListener('input', renderForms);
  $('#m-attend').addEventListener('change', renderForms);
  $$('[data-ftab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-ftab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-fpane]').forEach(p => { p.hidden = p.id !== b.dataset.ftab; });
    syncButtons();
  }));
  onOpenHook('m-attend', () => {
    $('#ma-sub').textContent = (ctx.P.home ? homeTxt() + ' · 담임 ' + ctx.me.name : '담임 학급을 내 설정에서 정하면 학년·반이 채워짐') + ' · 학교 양식 그대로';
    renderForms(); syncButtons();
  });

  $('#hwpxBtn').addEventListener('click', async () => {
    try {
      if (!v('a-name').trim()) { toast('학생 성명을 입력해 주세요'); return; }
      const from = v('a-from'), to = v('a-to') < from ? from : v('a-to'), h = home();
      const zip = await fillAbsence(jszip(), await template('absence.hwpx'), {
        kind: radio('a-kind'), grade: h.g, ban: h.b, no: v('a-no'), name: v('a-name').trim(), from, to, days: schoolDays(from, to),
        why: v('a-why'), attach: $$('#a-att input:checked').map(i => i.value), how: radio('a-how'), homeroom: ctx.me.name,
      });
      download(await toBlob(zip), '결석신고서_' + (v('a-no') || '') + '번_' + from.slice(5).replace('-', '') + '.hwpx');
    } catch (e) { toast('HWPX 생성 실패: ' + e.message); }
  });

  $('#printBtn').addEventListener('click', () => {
    const paper = $('#' + activeTab() + ' .paper'); if (!paper) return;
    paper.classList.add('print-target'); document.body.classList.add('print-mode');
    const done = () => { paper.classList.remove('print-target'); document.body.classList.remove('print-mode'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  });
  $('#clearBtn').addEventListener('click', () => {
    $$('#m-attend input[type="text"], #m-attend input[type="number"], #m-attend textarea').forEach(i => { i.value = i.defaultValue; });
    MONTH_ROWS = []; $('#m-status').textContent = ''; renderForms(); toast('입력값을 지움');
  });

  let lastFile = null;
  async function readNeis() {
    if (!lastFile) return;
    try {
      const rows = await readXlsx(jszip(), await lastFile.arrayBuffer());
      // 1~2월에 지난해 12월을 고르면 지난해로 봄
      const mm = Number(v('m-month')), y = mm > Number(ctx.today.slice(5, 7)) + 1 ? Number(year) - 1 : Number(year);
      MONTH_ROWS = parseAttendance(rows, { year: String(y), month: mm });
      $('#m-status').textContent = v('m-month') + '월 대상 ' + MONTH_ROWS.length + '건 (파일은 이 브라우저 메모리에만 있음)';
    } catch (e) { MONTH_ROWS = []; $('#m-status').textContent = e.message; }
    pMonth();
  }
  $('#neisFile').addEventListener('change', e => { lastFile = e.target.files[0] || null; e.target.value = ''; readNeis(); });
  $('#m-month').addEventListener('change', readNeis);
}
