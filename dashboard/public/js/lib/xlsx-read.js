// 아주 작은 .xlsx 읽기 (JSZip만 사용). 첫 번째 시트를 2차원 배열로 돌려줌.
// 외부 엑셀 라이브러리 없이 브라우저 안에서만 처리 — 나이스 출결 파일이 밖으로 나가지 않음.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = s => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] ?? m));

function sharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    [...m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t => unxml(t[1])).join(''));
}

const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export function parseSheet(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:r="(\d+)")?[^>]*>([\s\S]*?)<\/row>/g)) {
    const r = rm[1] ? Number(rm[1]) - 1 : rows.length;
    const row = rows[r] = rows[r] || [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] || '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs), t = (/t="(\w+)"/.exec(attrs) || [])[1];
      const c = ref ? colIndex(ref[1]) : row.length;
      const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => unxml(x[1])).join('');
      else if (t === 'str' || t === 'e') val = v != null ? unxml(v) : '';
      else if (t === 'b') val = v === '1';
      else if (v != null) val = Number(v);
      row[c] = val;
    }
  }
  return Array.from(rows, r => Array.from(r || [], x => (x === undefined ? '' : x)));
}

export async function readXlsx(JSZip, data) {
  const zip = await JSZip.loadAsync(data);
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  if (!wb) throw new Error('엑셀(.xlsx) 파일이 아님. 나이스에서 .xlsx로 내려받거나 엑셀에서 다른 이름으로 저장(.xlsx)해 주세요');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string') || '';
  const firstId = (/<sheet\b[^>]*r:id="([^"]+)"/.exec(wb) || [])[1];
  const target = firstId && (new RegExp('Id="' + firstId + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('Target="([^"]+)"[^>]*Id="' + firstId + '"').exec(rels) || [])[1];
  const path = target ? (target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')) : 'xl/worksheets/sheet1.xml';
  const sheet = await zip.file(path)?.async('string');
  if (!sheet) throw new Error('엑셀 시트를 찾지 못함');
  return parseSheet(sheet, sharedStrings(await zip.file('xl/sharedStrings.xml')?.async('string')));
}
