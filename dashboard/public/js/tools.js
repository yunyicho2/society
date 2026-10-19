// 규정 챗봇 · 공문 작성 도우미 · 그 외 자료 · 관리(규정 문서)
import { $, $$, esc, api, toast, copyText, onOpenHook, jszip } from './ui.js';
import { maskPII } from './lib/pii.js';
import { hwpxText } from './lib/hwpx-text.js';
import { hwpText } from './lib/hwp-text.js';

// **굵게** 와 [1] 표시만 허용하는 아주 작은 서식 변환 (나머지는 모두 글자로)
const fmt = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

export function initChat() {
  const log = $('#chatLog'), history = [];
  let busy = false;
  async function ask(raw) {
    if (busy) return;
    const q = maskPII(raw.trim()); if (!q) return;
    log.insertAdjacentHTML('beforeend', '<div class="bub me">' + esc(q) + '</div>');
    const wait = document.createElement('div'); wait.className = 'bub bot'; wait.textContent = '규정 문서를 찾는 중…'; log.appendChild(wait);
    log.scrollTop = log.scrollHeight; busy = true;
    try {
      const r = await api('chat', { method: 'POST', body: { q, history } });
      wait.innerHTML = fmt(r.answer) + (r.cites.length ? '<div class="cite">' + r.cites.map(c => '<span>' + esc(c) + '</span>').join('') + '</div>' : '');
      history.push({ role: 'user', text: q }, { role: 'assistant', text: r.answer });
      if (history.length > 12) history.splice(0, history.length - 12);
    } catch (e) { wait.textContent = e.message; }
    busy = false; log.scrollTop = log.scrollHeight;
  }
  $$('[data-ask]').forEach(b => b.addEventListener('click', () => ask(b.dataset.ask)));
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const q = $('#chatq').value; $('#chatq').value = ''; ask(q); });
}

export function initDoc() {
  $('#dcGo').addEventListener('click', async e => {
    const btn = e.currentTarget, memo = $('#dc-memo').value.trim();
    if (!memo) { toast('메모를 적어 주세요'); return; }
    btn.disabled = true; $('#dcOut').textContent = '초안을 만드는 중…';
    try {
      const r = await api('doc-draft', { method: 'POST', body: {
        kind: $('#dc-kind').value, ref: maskPII($('#dc-ref').value), title: maskPII($('#dc-title').value), memo: maskPII(memo),
      } });
      $('#dcOut').textContent = r.text;
    } catch (err) { $('#dcOut').textContent = err.message; }
    btn.disabled = false;
  });
  $('#dcCopy').addEventListener('click', e => copyText($('#dcOut').textContent, e.currentTarget));
}

export function initMore() {
  let loaded = false;
  async function load() {
    try {
      const j = await api('files');
      if (!loaded) $('#moreCat').innerHTML = j.cats.map(c => '<option>' + esc(c) + '</option>').join('');
      loaded = true;
      $('#moreBody').innerHTML = j.files.map(f => '<tr><td>' + (f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a>' : esc(f.name)) + '</td><td>' + esc(f.cat) + '</td><td>' + esc(f.by) + '</td><td>' + esc(f.date.slice(5)) + '</td></tr>').join('')
        || '<tr><td colspan="4">올라온 자료 없음</td></tr>';
    } catch (e) { $('#moreBody').innerHTML = '<tr><td colspan="4">' + esc(e.message) + '</td></tr>'; }
  }
  $('#moreFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast('20MB까지 올릴 수 있음'); return; }
    if (!confirm('"' + f.name + '" 파일에 학생 이름·학번 같은 개인정보가 없나요?\n공유 드라이브에 올리면 모든 교원이 볼 수 있어요.')) return;
    const fd = new FormData(); fd.append('file', f); fd.append('cat', $('#moreCat').value); fd.append('title', $('#moreTitle').value.trim());
    $('#moreDropText').textContent = '올리는 중…';
    try { await api('files', { method: 'POST', form: fd }); toast('공유 드라이브 그 외 자료 폴더에 올림'); $('#moreTitle').value = ''; await load(); }
    catch (err) { toast(err.message); }
    $('#moreDropText').textContent = '눌러서 파일 올리기';
  });
  onOpenHook('m-more', load);
}

export function initAdmin(ctx) {
  if (!ctx.me.can.manageDocs) return;
  $('#permLink').href = ctx.D.sheetUrl;
  async function load() {
    try {
      const j = await api('admin/docs');
      $('#docBody').innerHTML = j.docs.map(d => '<tr><td>' + esc(d.title) + '</td><td>' + d.chunks + '</td><td>' + esc(d.uploaded_by || '') + '</td><td>' + esc(String(d.at).slice(0, 10)) + '</td><td><button class="mini" type="button" data-del="' + esc(d.id) + '">삭제</button></td></tr>').join('')
        || '<tr><td colspan="5">올린 문서 없음 · 학교 규정, 출결·체험학습·수업변경 안내 문서를 올려 주세요</td></tr>';
    } catch (e) { $('#docBody').innerHTML = '<tr><td colspan="5">' + esc(e.message) + '</td></tr>'; }
  }
  $('#docFile').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) {
      try {
        const text = /\.hwpx$/i.test(f.name) ? await hwpxText(jszip(), await f.arrayBuffer())
          : /\.hwp$/i.test(f.name) ? await hwpText(await f.arrayBuffer()) : await f.text();
        if (text.length > 1_000_000) throw new Error('글자가 100만 자를 넘음. 문서를 나눠서 올려 주세요');
        toast('"' + f.name + '" 올리는 중…', 8000);
        const r = await api('admin/docs', { method: 'POST', body: { title: f.name.replace(/\.[^.]+$/, ''), text } });
        toast('"' + f.name + '" 등록 (' + r.chunks + '조각)');
      } catch (err) { toast(f.name + ': ' + err.message); }
    }
    load();
  });
  $('#docBody').addEventListener('click', async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (!confirm('이 문서를 챗봇에서 지울까요?')) return;
    try { await api('admin/docs?id=' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); load(); } catch (err) { toast(err.message); }
  });
  onOpenHook('m-admin', load);
}
