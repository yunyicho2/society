import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryD1 } from './d1.mjs';
import * as notes from '../functions/api/notes.js';
import { HttpError } from '../functions/_lib/http.js';

const DB = memoryD1();
const req = (method, body, q = '') => new Request('http://localhost/api/notes' + q, { method, body: body && JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const as = email => ({ env: { DB }, data: { user: { email } } });
// 실제로는 미들웨어가 HttpError를 응답으로 바꿈
const call = async (fn, email, r) => {
  try { const res = await fn({ ...as(email), request: r }); return { status: res.status, json: await res.json() }; }
  catch (e) { if (e instanceof HttpError) return { status: e.status, json: { error: e.message } }; throw e; }
};

test('메모: 만들기·고치기·고정·지우기, 다른 선생님 메모는 못 건드림', async () => {
  const a = await call(notes.onRequestPost, 'a@x.com', req('POST', { text: '수행평가 채점 마감 금요일', color: 'pink' }));
  assert.equal(a.status, 200);
  assert.equal(a.json.note.color, 'pink');
  await call(notes.onRequestPost, 'b@x.com', req('POST', { text: 'B 메모' }));

  const listA = await call(notes.onRequestGet, 'a@x.com', req('GET'));
  assert.deepEqual(listA.json.notes.map(n => n.text), ['수행평가 채점 마감 금요일']);

  const id = a.json.note.id;
  const up = await call(notes.onRequestPut, 'a@x.com', req('PUT', { id, text: '채점 마감 10/24', pinned: true, color: 'nope' }));
  assert.equal(up.json.note.text, '채점 마감 10/24');
  assert.equal(up.json.note.pinned, true);
  assert.equal(up.json.note.color, 'pink');   // 잘못된 색은 무시

  // B가 A의 메모를 고치거나 지우려 해도 안 됨
  assert.equal((await call(notes.onRequestPut, 'b@x.com', req('PUT', { id, text: '해킹' }))).status, 404);
  await call(notes.onRequestDelete, 'b@x.com', req('DELETE', null, '?id=' + id));
  assert.equal((await call(notes.onRequestGet, 'a@x.com', req('GET'))).json.notes.length, 1);

  await call(notes.onRequestDelete, 'a@x.com', req('DELETE', null, '?id=' + id));
  assert.equal((await call(notes.onRequestGet, 'a@x.com', req('GET'))).json.notes.length, 0);
  assert.equal((await call(notes.onRequestGet, 'b@x.com', req('GET'))).json.notes.length, 1);
});
