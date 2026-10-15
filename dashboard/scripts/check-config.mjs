// 배포 전에 config/dashboard.json을 검사 (문법 오류나 잘못된 링크가 있으면 배포를 멈춤)
import { readFile } from 'node:fs/promises';

const path = new URL('../public/config/dashboard.json', import.meta.url);
const errors = [];
let cfg;
try { cfg = JSON.parse(await readFile(path, 'utf8')); } catch (e) { console.error('dashboard.json 문법 오류:', e.message); process.exit(1); }

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
for (const k of ['rangeStart', 'progressEnd', 'examStart', 'lastDay']) if (!isDate(cfg.term?.[k])) errors.push('term.' + k + ' 날짜 형식(YYYY-MM-DD) 오류');
if (cfg.term && !(cfg.term.rangeStart <= cfg.term.progressEnd && cfg.term.progressEnd <= cfg.term.lastDay)) errors.push('term 날짜 순서 오류 (rangeStart ≤ progressEnd ≤ lastDay)');
for (const [key, card] of Object.entries(cfg.cards || {})) {
  if (!card.title) errors.push('cards.' + key + '.title 없음');
  (card.links || []).forEach((l, i) => {
    if (!l.label) errors.push('cards.' + key + '.links[' + i + '].label 없음');
    if (l.url && !/^https:\/\//.test(l.url)) errors.push('cards.' + key + '.links[' + i + '].url 은 https:// 로 시작해야 함');
  });
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('dashboard.json OK');
