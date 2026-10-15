import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { fillClassChange, fillAbsence } from '../public/js/lib/hwpx-fill.js';

const tpl = name => readFile(new URL('../public/templates/' + name, import.meta.url));
const texts = xml => [...xml.matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map(m => m[1]).join('|');

// 태그 짝이 맞는지 간단히 확인 (Node에는 DOMParser가 없음)
function balanced(xml) {
  const stack = [];
  for (const m of xml.matchAll(/<(\/?)([a-zA-Z0-9:]+)[^>]*?(\/?)>/g)) {
    if (m[0].startsWith('<?')) continue;
    const [, close, name, self] = m;
    if (self) continue;
    if (close) { if (stack.pop() !== name) return false; } else stack.push(name);
  }
  return stack.length === 0;
}

test('수업변경 신청서에 값이 들어가고 XML이 깨지지 않음', async () => {
  const zip = await fillClassChange(JSZip, await tpl('class-change.hwpx'), {
    teacher: '교사A', reason: '출장', detail: '업무 협의회', from: '2026-10-19', to: '2026-10-19',
    t1: '13:30', t2: '16:30', days: 1,
    rows: [{ date: '2026-10-19', grade: 1, ban: '3', period: 5, subj: '통합사회', toDate: '2026-10-21', toPeriod: 2, toSubj: '국1', who: '교사B' }],
  });
  const x = await zip.file('Contents/section0.xml').async('string');
  assert.ok(balanced(x));
  const t = texts(x);
  assert.match(t, /결강교사 : {2}교사A/);
  assert.match(t, /출장\(○\)/);
  assert.match(t, /10월 19일 월요일 13시 30분부터/);
  assert.match(t, /16시 30분까지 {2}\( 1 \)일/);
  assert.match(t, /\|10\/19\|1\|3\|5\|통합사회\|10\/21\|수\|2\|국1\|교사B/);
  assert.equal(Object.keys(zip.files)[0], 'mimetype');
});

test('결석 신고서에 값이 들어가고 XML이 깨지지 않음', async () => {
  const zip = await fillAbsence(JSZip, await tpl('absence.hwpx'), {
    kind: '질병', grade: 1, ban: 5, no: 7, name: '테스트', from: '2026-10-08', to: '2026-10-09', days: 2,
    why: '장염 진료', attach: ['진료확인서', '약국봉투'], how: '보호자와 전화연락', homeroom: '담임A',
  });
  const x = await zip.file('Contents/section0.xml').async('string');
  assert.ok(balanced(x));
  const t = texts(x);
  assert.match(t, /\(질병\)/);
  assert.match(t, /성 {3}명 : 테스트/);
  assert.match(t, /2026년 {2}10월 {2}8일부터/);
  assert.match(t, /\( 2 \)일간/);
  assert.match(t, /진료확인서 \( ○ \)/);
  assert.match(t, /약국봉투 \( ○ \)/);
  assert.match(t, /의사진단서 \( {4}\)/);
  assert.match(t, /보호자와 전화연락\( ○ \)/);
  assert.match(t, /학급담임 : {2}담임A/);
  assert.equal((t.match(/장염 진료/g) || []).length, 2);
  assert.equal(await zip.file('Preview/PrvText.txt').async('string'), '');
});
