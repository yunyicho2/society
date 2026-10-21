// 내 메모 (스티키 노트): 고치면 0.7초 뒤 자동 저장, 고정한 메모가 앞에
import { $, esc, api, toast } from './ui.js';
import { maskPII } from './lib/pii.js';

const COLORS = [['yellow', '노랑'], ['pink', '분홍'], ['blue', '파랑'], ['green', '초록'], ['purple', '보라']];

export function initNotes() {
  const board = $('#noteBoard'), status = $('#noteStatus');
  let NOTES = [];
  const timers = {};
  const when = s => { const t = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(t) ? '' : (t.getMonth() + 1) + '/' + t.getDate() + ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); };
  const looksPersonal = text => maskPII(text) !== text;

  function card(n) {
    const el = document.createElement('div');
    el.className = 'note' + (n.pinned ? ' pinned' : ''); el.dataset.id = n.id; el.dataset.color = n.color;
    el.innerHTML = '<textarea aria-label="메모" maxlength="2000" placeholder="메모를 적으세요"></textarea>' +
      '<div class="note-warn" hidden>개인정보로 보이는 글자가 있어요 · 학생 이름·번호는 적지 않기</div>' +
      '<div class="note-f">' + COLORS.map(([c, l]) => '<button class="dot" type="button" data-color="' + c + '" title="' + l + '" aria-label="' + l + '" style="background:var(--n-' + c + ')"></button>').join('') +
      '<button type="button" data-pin title="맨 앞에 고정">' + (n.pinned ? '고정 해제' : '고정') + '</button>' +
      '<button type="button" data-del title="삭제">삭제</button><span class="when">' + esc(when(n.updated)) + '</span></div>';
    const ta = el.querySelector('textarea');
    ta.value = n.text;
    el.querySelector('.note-warn').hidden = !looksPersonal(n.text);
    return el;
  }
  function render() {
    NOTES.sort((a, b) => (b.pinned - a.pinned) || String(b.updated).localeCompare(String(a.updated)));
    board.innerHTML = '';
    if (!NOTES.length) { board.innerHTML = '<div class="empty">메모가 없어요 · \'+ 새 메모\'로 추가</div>'; return; }
    NOTES.forEach(n => board.appendChild(card(n)));
  }
  const find = id => NOTES.find(n => n.id === id);
  async function save(id, patch) {
    status.textContent = '저장 중…';
    try {
      const { note } = await api('notes', { method: 'PUT', body: { id, ...patch } });
      Object.assign(find(id) || {}, note); status.textContent = '저장됨';
      const el = board.querySelector('[data-id="' + id + '"] .when'); if (el) el.textContent = when(note.updated);
    } catch (e) { status.textContent = ''; toast('메모 저장 실패: ' + e.message); }
  }

  board.addEventListener('input', e => {
    const ta = e.target.closest('textarea'); if (!ta) return;
    const el = ta.closest('.note'), id = el.dataset.id;
    el.querySelector('.note-warn').hidden = !looksPersonal(ta.value);
    status.textContent = '…';
    clearTimeout(timers[id]); timers[id] = setTimeout(() => save(id, { text: ta.value }), 700);
  });
  board.addEventListener('click', async e => {
    const el = e.target.closest('.note'); if (!el) return;
    const id = el.dataset.id, n = find(id); if (!n) return;
    const c = e.target.closest('[data-color]');
    if (c && c.classList.contains('dot')) { n.color = c.dataset.color; el.dataset.color = n.color; save(id, { color: n.color }); return; }
    if (e.target.closest('[data-pin]')) { n.pinned = !n.pinned; await save(id, { pinned: n.pinned }); render(); return; }
    if (e.target.closest('[data-del]')) {
      const text = el.querySelector('textarea').value.trim();
      if (text && !confirm('이 메모를 지울까요?')) return;
      try { clearTimeout(timers[id]); await api('notes?id=' + encodeURIComponent(id), { method: 'DELETE' }); NOTES = NOTES.filter(x => x.id !== id); render(); }
      catch (err) { toast(err.message); }
    }
  });
  $('#noteAdd').addEventListener('click', async () => {
    try {
      const { note } = await api('notes', { method: 'POST', body: { text: '', color: 'yellow' } });
      NOTES.unshift(note); render();
      const ta = board.querySelector('[data-id="' + note.id + '"] textarea'); if (ta) ta.focus();
    } catch (e) { toast(e.message); }
  });
  // 창을 닫기 전 저장 안 된 메모가 있으면 알림
  window.addEventListener('beforeunload', e => { if (Object.values(timers).some(Boolean) && status.textContent === '…') { e.preventDefault(); e.returnValue = ''; } });

  api('notes').then(j => { NOTES = j.notes; render(); }).catch(e => { board.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
}
