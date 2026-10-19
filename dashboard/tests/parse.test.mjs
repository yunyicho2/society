import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildModel, toISO, toTime, parsePeriods, parseGrades, normalizeRoles } from '../functions/_lib/model.js';
import { maskPII } from '../public/js/lib/pii.js';
import { parseAttendance, splitType } from '../public/js/lib/neis-attendance.js';
import { readXlsx } from '../public/js/lib/xlsx-read.js';
import { parseMeals } from '../functions/_lib/neis.js';
import { dustGrade } from '../functions/_lib/weather.js';
import { chunk } from '../functions/_lib/rag.js';
import { paraTexts } from '../public/js/lib/hwp-text.js';

const serial = iso => (Date.parse(iso + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 864e5;

test('시트 날짜·시각 변환', () => {
  assert.equal(toISO(serial('2026-10-19')), '2026-10-19');
  assert.equal(toISO('2026. 10. 9'), '2026-10-09');
  assert.equal(toISO('10/9/2026'), '2026-10-09');
  assert.equal(toTime(16 / 24 + 40 / 1440), '16:40');
  assert.deepEqual(parsePeriods('3~7교시'), [3, 4, 5, 6, 7]);
  assert.deepEqual(parsePeriods('1,2교시'), [1, 2]);
  assert.deepEqual(parsePeriods('전체'), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(parseGrades('1·2학년'), [1, 2]);
  assert.deepEqual(parseGrades('전체'), [1, 2, 3]);
  assert.deepEqual(normalizeRoles('수업계'), ['교사', '시간표 담당']);
  assert.deepEqual(normalizeRoles('교무부장, 정보'), ['교사', '교무부장', '정보 담당']);
});

test('시트 탭 → 모델', () => {
  const m = buildModel({
    perm: [['A@Example.com', '교사A', '교무부장', '교무기획', ''], ['', '이름만', '교사']],
    tt: [['교사A', '월', '국1 1-1', '', '탐A 316호', '', '', '', '창체'], ['교사A', '화', '', '국1 1-2']],
    cal: [
      [serial('2026-10-13'), '화', '1차 정기고사', '시험', '전체', '전체', '10/13~10/16'],
      [serial('2026-10-14'), '수', '1차 정기고사', '시험', '전체', '전체'],
      [serial('2026-10-16'), '금', '1차 정기고사', '시험', '전체', '전체'],
      [serial('2026-11-18'), '수', '수능 출정식', '행사', '1·2학년', '3~7교시'],
      [serial('2026-11-18'), '수', '수능 출정식', '행사', '3학년', '전체'],
      [serial('2026-12-21'), '월', '합창페스티벌', '행사', '전체', '없음'],
    ],
    duty: [[serial('2026-10-01'), '목', '교사1', '교사2', '교사3', '교사4', '', '', '교사5', '교사6']],
    plan: [[serial('2026-10-08'), '목', 16 / 24 + 40 / 1440, '교직원 연수', '시청각실', '전 교직원', '교무기획부', true], [serial('2026-10-09'), '', '', '예시', '', '', '', false]],
    subs: [['2026-10-08', '목', 3, '1-7', '통합과학', '가', '연가', '나', '대강', '시간표 담당', '예시 행', '확정', '예시'], [serial('2026-10-21'), '', 1, '1-1', '국1', '교사A', '출장', '교사B', '교체', '교사A', '', '결재 대기', '261015-ab12']],
    files: [['자료1', '인사', 'https://drive.google.com/x', '교무', serial('2026-03-14'), ''], ['자료2', '기타', 'javascript:alert(1)', '', '', '']],
  });
  assert.deepEqual(Object.keys(m.perms), ['a@example.com']);
  assert.deepEqual(m.perms['a@example.com'].roles, ['교사', '교무부장']);
  assert.equal(m.tt['교사A']['0-1'], '국1|1-1');
  assert.equal(m.tt['교사A']['0-3'], '탐A|316호');
  assert.equal(m.tt['교사A']['0-7'], '창체|');
  assert.equal(m.tt['교사A']['1-2'], '국1|1-2');
  // 시험 기간은 하나의 일정으로 묶임 (주말 건너뜀)
  assert.deepEqual(m.events[0], { s: '2026-10-13', e: '2026-10-16', label: '1차 정기고사', note: '수업 없음' });
  assert.equal(m.rules.filter(r => r.d === '2026-11-18').length, 2);
  assert.ok(!m.rules.some(r => r.d === '2026-12-21'));  // 수업 없는 교시 '없음'
  assert.match(m.events.find(e => e.label === '수능 출정식').note, /1·2학년 3~7교시 수업 없음/);
  assert.equal(m.duty['2026-10-01'].traffic, '교사6');
  assert.equal(m.plans.length, 1);
  assert.equal(m.plans[0].time, '16:40');
  assert.equal(m.plans[0].morning, true);
  assert.equal(m.subs.length, 1);
  assert.equal(m.subs[0].row, 5);
  assert.equal(m.subs[0].status, '결재 대기');
  assert.equal(m.files.find(f => f.name === '자료2').url, '');  // https 링크만
});

test('AI로 보내기 전 개인정보 가림', () => {
  const s = maskPII('학생 김철수가 010-1234-5678로 연락, 학번 10507, 1학년 5반 7번, 홍길동 학생 결석. 2026학년도 전체 학생 대상, 예산 10000원');
  assert.doesNotMatch(s, /철수|1234-5678|10507|길동|7번/);
  assert.match(s, /2026학년도 전체 학생 대상/);
  assert.match(s, /10000원/);
  assert.equal(maskPII('명렬 이영희 결석', ['이영희']), '명렬 이○○ 결석');
});

test('나이스 출결 구분 나누기', () => {
  assert.deepEqual(splitType('질병지각'), { kind: '질병', act: '지각' });
  assert.deepEqual(splitType('미인정 결석'), { kind: '미인정', act: '결석' });
  assert.deepEqual(splitType('인정결과'), { kind: '인정', act: '결과' });
});

test('나이스 출결 엑셀(.xlsx) → 월별 확인현황 행', async () => {
  // 가상의 학생 자료로 작은 xlsx를 만들어 읽어 봄
  const rows = [
    ['2026학년도 출결 현황'], [],
    ['번호', '성명', '일자', '출결구분', '사유', '교시'],
    [3, '학생가', serial('2026-10-06'), '질병조퇴', '복통', '5~7'],
    ['', '', serial('2026-10-08'), '인정결과', '보건실', '3'],
    [11, '학생나', '2026-10-12', '질병결석', '감기', ''],
    [18, '학생다', '2026.10.19', '미인정지각', '', ''],
    [21, '학생라', '2026-11-02', '질병지각', '', ''],
  ];
  const strings = [], idx = s => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1; } return i; };
  const col = i => String.fromCharCode(65 + i);
  const sheet = '<worksheet><sheetData>' + rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => v === '' ? '' :
    typeof v === 'number' ? '<c r="' + col(ci) + (ri + 1) + '"><v>' + v + '</v></c>' : '<c r="' + col(ci) + (ri + 1) + '" t="s"><v>' + idx(v) + '</v></c>').join('') + '</row>').join('') + '</sheetData></worksheet>';
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="출결" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', sheet);
  zip.file('xl/sharedStrings.xml', '<sst>' + strings.map(s => '<si><t>' + s + '</t></si>').join('') + '</sst>');
  const grid = await readXlsx(JSZip, await zip.generateAsync({ type: 'uint8array' }));
  const out = parseAttendance(grid, { year: '2026', month: 10 });
  assert.deepEqual(out.map(r => [r.no, r.name, r.kind, r.act, r.day]), [
    ['3', '학생가', '질병', '조퇴', 6], ['3', '학생가', '인정', '결과', 8], ['18', '학생다', '미인정', '지각', 19],
  ]);
  assert.equal(out[0].dow, '화');
});

test('나이스 급식 응답 정리', () => {
  const j = { mealServiceDietInfo: [{ head: [] }, { row: [
    { MMEAL_SC_NM: '중식', MLSV_YMD: '20261019', DDISH_NM: '기장밥<br/>한방오리탕 (2.5.6.13)<br/>배추김치* (9)', CAL_INFO: '742.7 Kcal' },
    { MMEAL_SC_NM: '석식', MLSV_YMD: '20261019', DDISH_NM: '카레라이스 (1.2.5.6)', CAL_INFO: '690.1 Kcal' },
  ] }] };
  const m = parseMeals(j);
  assert.deepEqual(m['2026-10-19']['중식'].menu, [['기장밥', ''], ['한방오리탕', '2.5.6.13'], ['배추김치', '9']]);
  assert.equal(m['2026-10-19']['중식'].kcal, '742.7');
  assert.ok(m['2026-10-19']['석식']);
});

test('미세먼지 등급과 문서 자르기', () => {
  assert.equal(dustGrade(20, 10), '좋음');
  assert.equal(dustGrade(20, 40), '나쁨');
  assert.equal(dustGrade(null, null), '');
  const parts = chunk(Array.from({ length: 40 }, (_, i) => '제' + i + '조 ' + '가'.repeat(60)).join('\n'));
  assert.ok(parts.length > 2);
  assert.ok(parts.every(p => p.length <= 1050));
});

test('개인정보 가림: 줄을 넘지 않고, 일반 문장은 그대로', () => {
  assert.equal(maskPII('학생\n회의실'), '학생\n회의실');
  assert.equal(maskPII('다양한 학생 참여형 수업, 학생 현황, 위기 학생 조기 발견'), '다양한 학생 참여형 수업, 학생 현황, 위기 학생 조기 발견');
  assert.equal(maskPII('담임 최수진께 전달, 정민호 학생 결석'), '담임 최○○께 전달, 정○○ 학생 결석');
});

test('공식 문서 올리기: 주민번호·휴대전화·메일만 가림', () => {
  const s = maskPII('업무분장 교무기획부 김교사, 학생 현황, 문의 052-936-7800, 010-1234-5678, a@b.kr, 900101-1234567', [], { level: 'doc' });
  assert.match(s, /김교사/);
  assert.match(s, /052-936-7800/);
  assert.doesNotMatch(s, /1234-5678|a@b\.kr|1234567/);
});

test('한글(.hwp) 문단 레코드에서 글자 뽑기', () => {
  // PARA_HEADER(66) 뒤에 PARA_TEXT(67) 레코드: 글자 + 탭 + 표 제어문자(16바이트)
  const rec = (tag, body) => { const h = Buffer.alloc(4); h.writeUInt32LE(tag | (body.length << 20)); return Buffer.concat([h, body]); };
  const text = Buffer.concat([Buffer.from('학교', 'utf16le'), Buffer.from([9, 0]), Buffer.alloc(14), Buffer.from([11, 0]), Buffer.alloc(14), Buffer.from('교육계획', 'utf16le'), Buffer.from([13, 0])]);
  const data = Buffer.concat([rec(66, Buffer.alloc(8)), rec(67, text), rec(67, Buffer.from('  ', 'utf16le'))]);
  assert.deepEqual(paraTexts(new Uint8Array(data)), ['학교 교육계획']);
});

test('업무분장 탭: 질문과 관련된 담당자 찾기', async () => {
  const { parseDuties } = await import('../functions/_lib/model.js');
  const { matchDuties } = await import('../functions/_lib/duties.js');
  const duties = parseDuties([
    ['교무기획부', '일과', '교사가', '◦ 수업 및 평가 시간표 작성\n◦ 결강·보강·대강 내역 나이스 입력'],
    ['교육과정부', '교과서', '교사나', '◦ 교과서 선정 및 주문'],
    ['행정실', '영양사', '직원다', '◦ 학교급식 운영 업무 총괄'],
    ['예시', '', '예시', '', '예시 행'],
  ]);
  assert.equal(duties.length, 3);
  assert.deepEqual(duties[0].detail, ['수업 및 평가 시간표 작성', '결강·보강·대강 내역 나이스 입력']);
  assert.deepEqual(matchDuties('시간표 짜는 사람 누구야?', duties).map(d => d.name), ['교사가']);
  assert.deepEqual(matchDuties('교과서 주문 담당', duties).map(d => d.name), ['교사나']);
  assert.deepEqual(matchDuties('급식 문의는?', duties).map(d => d.name), ['직원다']);
  assert.deepEqual(matchDuties('교사나 선생님 업무', duties).map(d => d.name), ['교사나']);
  assert.deepEqual(matchDuties('오늘 날씨 어때', duties), []);
});
