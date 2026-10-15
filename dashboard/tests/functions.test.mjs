// Pages Functions를 네트워크 없이 돌려 봄: 구글·Claude 호출은 가짜 fetch로 받음
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { onRequestGet as bootstrap } from '../functions/api/bootstrap.js';
import { onRequestGet as morning } from '../functions/api/morning.js';
import { onRequestPost as subsPost } from '../functions/api/subs/index.js';
import { onRequestPost as statusPost } from '../functions/api/subs/status.js';
import { onRequestPost as docDraft } from '../functions/api/doc-draft.js';
import { invalidate } from '../functions/_lib/store.js';
import { todayKST, addDays, dow } from '../public/js/lib/dates.js';

const { privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey)).toString('base64');
const PEM = '-----BEGIN PRIVATE KEY-----\\n' + pkcs8 + '\\n-----END PRIVATE KEY-----\\n';

// 다음 주 월요일·수요일 (지난 날짜 검사에 걸리지 않게)
let mon = addDays(todayKST(), 7); while (dow(mon) !== 1) mon = addDays(mon, 1);
const wed = addDays(mon, 2);

const SHEET = {
  '권한!A4:E': [['teacher@example.com', '교사A', '교사'], ['head@example.com', '교사H', '교무부장'], ['tt@example.com', '교사T', '시간표 담당']],
  '전체시간표!A4:I': [['교사A', '월', '국1 1-1'], ['교사B', '수', '국1 1-1'], ['교사H', '월', '', '수1 1-2']],
  '학사일정!A4:G': [], '당번표!A4:K': [[todayKST(), '', '교사1', '교사2', '교사3', '', '', '', '교사4', '교사5']],
  '월중계획!A4:H': [], '관리자일정!A4:F': [], '대강교체!A4:M': [], '그외자료!A4:F': [],
};
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init });
  const ok = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'tok', expires_in: 3600 });
  if (url.includes('/values:batchGet')) {
    const ranges = [...new URL(url).searchParams.getAll('ranges')];
    return ok({ valueRanges: ranges.map(r => ({ values: SHEET[r] || [] })) });
  }
  if (url.includes(':append')) {
    const rows = JSON.parse(init.body).values;
    rows.forEach(r => SHEET['대강교체!A4:M'].push(r));
    return ok({});
  }
  if (url.includes('/values:batchUpdate')) {
    JSON.parse(init.body).data.forEach(d => { const row = Number(d.range.match(/L(\d+)/)[1]); SHEET['대강교체!A4:M'][row - 4][11] = d.values[0][0]; });
    return ok({});
  }
  if (url.startsWith('https://api.anthropic.com/')) {
    const b = JSON.parse(init.body);
    if (/거절/.test(JSON.stringify(b.messages))) return ok({ id: 'm', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } });
    return ok({ id: 'm', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: '제목  연수 실시\n\n1. 연수를 실시합니다.  끝.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
  }
  throw new Error('예상하지 못한 호출 ' + url);
};

const DB = { prepare: () => ({ bind: () => ({ run: async () => ({}), first: async () => ({ n: 1 }), all: async () => ({ results: [] }) }) }) };
const envFor = email => ({ DEV_USER_EMAIL: email, SHEET_ID: 'sheet', GOOGLE_SA_EMAIL: 'sa@x.iam.gserviceaccount.com', GOOGLE_SA_KEY: PEM, ANTHROPIC_API_KEY: 'sk-test', DB });

async function call(handler, email, { method = 'GET', path = '/api/x', body } = {}) {
  const request = new Request('http://localhost:8788' + path, { method, body: body && JSON.stringify(body), headers: body ? { 'content-type': 'application/json', origin: 'http://localhost:8788' } : {} });
  const ctx = { request, env: envFor(email), data: {}, waitUntil() {} };
  ctx.next = () => handler(ctx);
  const res = await middleware(ctx);
  return { status: res.status, json: await res.json() };
}

test('등록되지 않은 계정은 403', async () => {
  const r = await call(bootstrap, 'stranger@example.com');
  assert.equal(r.status, 403);
  assert.match(r.json.error, /등록되지 않은 계정/);
});

test('배포 주소에서는 DEV_USER_EMAIL 우회가 안 됨', async () => {
  const request = new Request('https://office.example.com/api/bootstrap');
  const ctx = { request, env: { ...envFor('teacher@example.com'), ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'aud' }, data: {} };
  ctx.next = () => bootstrap(ctx);
  const res = await middleware(ctx);
  assert.equal(res.status, 401);
});

test('bootstrap: 내 이름·권한, 당번표·메일은 내려보내지 않음', async () => {
  const r = await call(bootstrap, 'teacher@example.com');
  assert.equal(r.status, 200);
  assert.equal(r.json.me.name, '교사A');
  assert.equal(r.json.me.can.morning, false);
  assert.equal(r.json.tt['교사A']['0-1'], '국1|1-1');
  const text = JSON.stringify(r.json);
  assert.doesNotMatch(text, /head@example|교사4|교사5/);
});

test('아침 안내는 교무부장만', async () => {
  assert.equal((await call(morning, 'teacher@example.com')).status, 403);
  const r = await call(morning, 'head@example.com', { path: '/api/morning' });
  assert.equal(r.status, 200);
  assert.match(r.json.text, /교통지도 07:40~08:00\n {2}교사5/);
});

test('수업 변경 신청: 남의 수업은 막고, 맞으면 시트에 결재 대기로 2줄', async () => {
  const row = { date: mon, p: 1, cls: '1-1', subj: '국1', toDate: wed, toP: 1, toCls: '1-1', toSubj: '국1', who: '교사B' };
  const bad = await call(subsPost, 'teacher@example.com', { method: 'POST', body: { absent: '교사H', reason: '출장', rows: [row] } });
  assert.equal(bad.status, 403);
  const wrong = await call(subsPost, 'teacher@example.com', { method: 'POST', body: { reason: '출장', rows: [{ ...row, p: 2 }] } });
  assert.equal(wrong.status, 400);
  const ok = await call(subsPost, 'teacher@example.com', { method: 'POST', body: { reason: '출장', detail: '협의회', rows: [row] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const rows = SHEET['대강교체!A4:M'];
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], null);            // 요일 수식 열은 건너뜀
  assert.equal(rows[0][11], '결재 대기');
  assert.equal(rows[1][5], '교사B');
  invalidate();

  // 교사는 확정 못 함, 수업계는 확정
  assert.equal((await call(statusPost, 'teacher@example.com', { method: 'POST', body: { id: ok.json.id, status: '확정' } })).status, 403);
  const conf = await call(statusPost, 'tt@example.com', { method: 'POST', body: { id: ok.json.id, status: '확정' } });
  assert.equal(conf.status, 200);
  assert.equal(SHEET['대강교체!A4:M'][0][11], '확정');
});

test('공문 도우미: 개인정보를 가리고 Opus 5.5 + 서버 대체 모델 설정으로 호출', async () => {
  calls.length = 0;
  const r = await call(docDraft, 'teacher@example.com', { method: 'POST', body: { kind: '내부결재', title: '연수', memo: '학생 김철수 010-1234-5678 관련 연수' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.match(r.json.text, /끝\./);
  const c = calls.find(x => x.url.startsWith('https://api.anthropic.com/'));
  const body = JSON.parse(c.init.body);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(body.output_config, { effort: 'low' });
  const headers = new Headers(c.init.headers);
  assert.match(headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.doesNotMatch(c.init.body, /철수|1234-5678/);

  const refused = await call(docDraft, 'teacher@example.com', { method: 'POST', body: { memo: '거절 테스트' } });
  assert.equal(refused.status, 422);
});
