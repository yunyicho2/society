// 학교 HWPX 양식 채우기 — 브라우저와 Node(테스트) 양쪽에서 사용.
// JSZip을 인자로 받아 쓰고, 결과 zip을 돌려준다. 학생 정보는 이 함수 밖으로 저장·전송하지 않는다.
//
// HWPX 구조 메모: Contents/section0.xml 안에 <hp:p>(문단) → <hp:run>(서식 단위) → <hp:t>(글자).
// 표는 <hp:tbl> → <hp:tc>(칸) 안의 <hp:cellAddr colAddr rowAddr>로 위치를 찾는다.
// 글자를 바꾼 문단은 <hp:linesegarray>(줄 배치 캐시)를 지워 한글이 열 때 다시 계산하게 한다.

const DOW = '일월화수목금토';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dropLineSeg = p => p.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, '');

// 문단 하나의 글자를 통째로 바꿈 (첫 run 서식 유지)
export function replaceParagraphText(xml, find, text) {
  const i = xml.indexOf(find); if (i < 0) throw new Error('양식에서 문구를 찾지 못함: ' + find);
  const s = xml.lastIndexOf('<hp:p ', i), e = xml.indexOf('</hp:p>', i) + 7;
  const p = xml.slice(s, e);
  const first = /<hp:run charPrIDRef="(\d+)">/.exec(p);
  const open = p.slice(0, p.indexOf('>') + 1);
  return xml.slice(0, s) + open + '<hp:run charPrIDRef="' + (first ? first[1] : '0') + '"><hp:t>' + esc(text) + '</hp:t></hp:run></hp:p>' + xml.slice(e);
}

// 문단 안 한 run의 글자만 바꿈 (서식이 run마다 다른 문단용). 줄 배치 캐시도 지움
export function replaceRunText(xml, find, text) {
  const tag = '<hp:t>' + esc(find) + '</hp:t>';
  const i = xml.indexOf(tag); if (i < 0) throw new Error('양식에서 문구를 찾지 못함: ' + find);
  const s = xml.lastIndexOf('<hp:p ', i), e = xml.indexOf('</hp:p>', i) + 7;
  const p = xml.slice(s, e).replace(tag, '<hp:t>' + esc(text) + '</hp:t>');
  return xml.slice(0, s) + dropLineSeg(p) + xml.slice(e);
}

// '<hp:t>' 안에 <hp:fwSpace/> 같은 태그가 섞인 run: 시작 글자로 찾아 run 글자 전체를 바꿈
export function replaceRunPrefix(xml, prefix, text) {
  const i = xml.indexOf('<hp:t>' + esc(prefix)); if (i < 0) throw new Error('양식에서 문구를 찾지 못함: ' + prefix);
  const j = xml.indexOf('</hp:t>', i) + 7;
  const s = xml.lastIndexOf('<hp:p ', i), e = xml.indexOf('</hp:p>', i) + 7;
  const p = xml.slice(s, i) + '<hp:t>' + esc(text) + '</hp:t>' + xml.slice(j, e);
  return xml.slice(0, s) + dropLineSeg(p) + xml.slice(e);
}

// n번째 표(0부터)의 (열, 행) 칸에 글자 넣기
export function setCell(xml, tblIndex, col, row, text) {
  let pos = -1;
  for (let k = 0; k <= tblIndex; k++) { pos = xml.indexOf('<hp:tbl ', pos + 1); if (pos < 0) throw new Error('표를 찾지 못함'); }
  const tblEnd = xml.indexOf('</hp:tbl>', pos);
  const addr = '<hp:cellAddr colAddr="' + col + '" rowAddr="' + row + '"/>';
  const a = xml.indexOf(addr, pos); if (a < 0 || a > tblEnd) throw new Error('칸을 찾지 못함 ' + col + ',' + row);
  const s = xml.lastIndexOf('<hp:tc ', a);
  let cell = xml.slice(s, a);
  const t = '<hp:t>' + esc(text) + '</hp:t>';
  if (/<hp:run charPrIDRef="\d+"\/>/.test(cell)) cell = cell.replace(/<hp:run charPrIDRef="(\d+)"\/>/, '<hp:run charPrIDRef="$1">' + t + '</hp:run>');
  else cell = cell.replace(/<hp:t>[^<]*<\/hp:t>/, t);
  return xml.slice(0, s) + dropLineSeg(cell) + xml.slice(a);
}

const ymd = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d, w: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }; };
const pad = (s, n) => { s = String(s ?? ''); return s.length >= n ? s : ' '.repeat(Math.ceil((n - s.length) / 2)) + s + ' '.repeat(Math.floor((n - s.length) / 2)); };

async function open(JSZip, template) {
  const zip = await JSZip.loadAsync(template);
  const x = await zip.file('Contents/section0.xml').async('string');
  return { zip, x };
}
function close(zip, x) {
  zip.file('Contents/section0.xml', x);
  // 미리보기 글자에 원본 양식 글이 남지 않도록 비움
  if (zip.file('Preview/PrvText.txt')) zip.file('Preview/PrvText.txt', '');
  // mimetype은 압축하지 않고 맨 앞에 있어야 한글이 연다 (JSZip은 처음 넣은 순서를 유지)
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  return zip;
}

export const MAX_CHANGE_ROWS = 5;

/* 2026학년도 수업변경 신청서
 * data = { teacher, reason, detail, from:'2026-10-19', to, t1:'08:30', t2:'16:30', days,
 *          rows:[{ date, grade, ban, period, subj, toDate, toPeriod, toSubj, who }] } (최대 5줄) */
export async function fillClassChange(JSZip, template, data) {
  let { zip, x } = await open(JSZip, template);
  x = replaceParagraphText(x, '* 결강교사 :', '* 결강교사 :  ' + data.teacher + '  (인)');
  const reasons = ['출장', '공가', '연가', '병가', '특별휴가', '조퇴', '외출'];
  const line = reasons.map(r => (r === data.reason ? r + '(○)' : r)).join(', ') + ', 기타(' + (reasons.includes(data.reason) ? '   ' : ' ' + data.reason + ' ') + ')';
  x = replaceRunText(x, ' 출장, 공가, 연가, 병가, 특별휴가, 조퇴, 외출, 기타(   )', ' ' + line);
  x = replaceParagraphText(x, '구체적 사유(', '구체적 사유( ' + (data.detail || '') + ' )');
  const a = ymd(data.from), b = ymd(data.to), [h1, m1] = data.t1.split(':'), [h2, m2] = data.t2.split(':');
  x = replaceParagraphText(x, '* 나이스복무 신청일시 :', '* 나이스복무 신청일시 :  ' + a.m + '월 ' + a.d + '일 ' + a.w + '요일 ' + h1 + '시 ' + m1 + '분부터');
  x = replaceParagraphText(x, '분까지  (    )일', '                        ' + b.m + '월 ' + b.d + '일 ' + b.w + '요일 ' + h2 + '시 ' + m2 + '분까지  ( ' + data.days + ' )일');
  // 계획표: 문서의 세 번째 표, 2~6행
  (data.rows || []).slice(0, MAX_CHANGE_ROWS).forEach((r, i) => {
    const row = 2 + i, f = ymd(r.date), t = r.toDate ? ymd(r.toDate) : null;
    const vals = [f.m + '/' + f.d, r.grade, r.ban, r.period, r.subj, t ? t.m + '/' + t.d : '', t ? t.w : '', r.toPeriod || '', r.toSubj || '', r.who || ''];
    vals.forEach((v, col) => { x = setCell(x, 2, col, row, String(v ?? '')); });
  });
  return close(zip, x);
}

/* 결석 신고서 (+ 담임교사 확인서, 학부모 의견서 머리)
 * data = { kind:'질병'|'인정'|'기타', grade, ban, no, name, from, to, days, why,
 *          attach:['진료확인서', ...], how:'보호자와 전화연락'|'학부모내교'|'기타', homeroom } */
export async function fillAbsence(JSZip, template, data) {
  let { zip, x } = await open(JSZip, template);
  x = replaceRunPrefix(x, '(질병', '(' + data.kind + ')');
  x = replaceRunText(x, '   학   번 : 제    학년     반      번  ', '   학   번 : 제 ' + pad(data.grade, 3) + '학년 ' + pad(data.ban, 4) + '반 ' + pad(data.no, 5) + '번  ');
  x = replaceRunText(x, '   성   명 : ', '   성   명 : ' + (data.name || ''));
  const a = ymd(data.from), b = ymd(data.to);
  x = replaceRunText(x, '2026년     월    일부터   2026년     월    일까지  (    )일간',
    a.y + '년  ' + a.m + '월  ' + a.d + '일부터   ' + b.y + '년  ' + b.m + '월  ' + b.d + '일까지  ( ' + data.days + ' )일간');
  x = setCell(x, 0, 1, 1, data.why || '');
  const mark = (line, items) => items.reduce((s, it) => s.replace(it + ' (    )', it + ' ( ○ )'), line);
  const att = data.attach || [];
  const l1 = '의사진단서 (    )  의사소견서 (    )  진료확인서 (    )  병원처방전 (    )';
  const l2 = '약국봉투 (    )  학부모의견서 (    )  담임교사확인서 (    )  기타 (    )';
  x = replaceRunText(x, l1, mark(l1, att));
  x = replaceRunText(x, l2, mark(l2, att));
  x = replaceRunText(x, '본  인 :                 (인)', '본  인 :   ' + pad(data.name, 8) + '   (인)');
  const how = '보호자와 전화연락(    )  학부모내교(    )  기타(                        )';
  const howDone = data.how === '기타'
    ? how.replace('기타(                        )', '기타( ○ ' + (data.howNote || '') + ' )')
    : how.replace(data.how + '(    )', data.how + '( ○ )');
  x = replaceRunText(x, how, howDone);
  x = setCell(x, 1, 1, 2, data.why || '');
  x = replaceRunText(x, '학급담임 :          (인)', '학급담임 :  ' + (data.homeroom || '') + '  (인)');
  x = replaceRunText(x, '  학년   반   번  이름 :   ', ' ' + data.grade + '학년 ' + data.ban + '반 ' + data.no + '번  이름 : ' + (data.name || '') + '  ');
  return close(zip, x);
}

export async function toBlob(zip) {
  return zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
}
