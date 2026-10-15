// 화면 공통 도구
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

// 서버 호출. 오류는 서버가 준 한국어 메시지로 throw
export async function api(path, { method = 'GET', body, form } = {}) {
  const init = { method, headers: {}, credentials: 'same-origin' };
  if (form) init.body = form;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  let r;
  try { r = await fetch('/api/' + path, init); } catch { throw new Error('네트워크 연결을 확인해 주세요'); }
  // Access 세션이 끝나면 로그인 페이지(HTML)로 돌려보냄
  const type = r.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    if (r.status === 401 || r.status === 403 || r.redirected || type.includes('text/html')) { location.reload(); throw new Error('다시 로그인해 주세요'); }
    throw new Error('서버 응답 오류 (' + r.status + ')');
  }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || '서버 오류');
  return j;
}

// 모달·서랍 열고 닫기 (data-open / data-close)
const onOpen = {};
let lastFocus = null;
export function onOpenHook(id, fn) { (onOpen[id] = onOpen[id] || []).push(fn); }
export function open(id) {
  const el = document.getElementById(id); if (!el) return;
  if (id === 'chat') { el.hidden = !el.hidden; if (!el.hidden) $('#chatq').focus(); return; }
  lastFocus = document.activeElement; el.hidden = false;
  (onOpen[id] || []).forEach(fn => fn());
  const x = el.querySelector('.x'); if (x) x.focus();
}
export function close(id) {
  const el = document.getElementById(id); if (el) el.hidden = true;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
export function initModals() {
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { open(o.dataset.open); return; }
    const c = e.target.closest('[data-close]'); if (c) close(c.dataset.close);
  });
  $$('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) close(o.id); }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    $$('.overlay').forEach(o => { if (!o.hidden) close(o.id); });
    $('#chat').hidden = true;
  });
  $$('[data-scroll]').forEach(b => b.addEventListener('click', () => {
    const t = document.getElementById(b.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function copyText(text, btn) {
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = '복사됨'; }
  catch { btn.textContent = '복사 실패 · 직접 선택해 주세요'; }
  setTimeout(() => (btn.textContent = label), 1500);
}

export const radio = name => { const c = document.querySelector('input[name="' + name + '"]:checked'); return c ? c.value : ''; };

// 서식 보존용 템플릿 불러오기 (브라우저 캐시 사용)
const TPL = {};
export async function template(name) {
  if (!TPL[name]) TPL[name] = fetch('/templates/' + name).then(r => { if (!r.ok) throw new Error('양식 파일을 불러오지 못함'); return r.arrayBuffer(); });
  return TPL[name];
}
export function jszip() {
  if (typeof window.JSZip === 'undefined') throw new Error('HWPX 도구를 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요');
  return window.JSZip;
}
