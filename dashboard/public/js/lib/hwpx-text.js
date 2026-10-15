// HWPX 문서에서 글자만 뽑기 (규정 챗봇 문서 올리기용). 문단마다 한 줄
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function sectionText(xml) {
  // 문단 끝(</hp:p>)마다 자르면 표 안 칸의 문단도 한 줄씩 나옴
  return xml.split('</hp:p>').map(seg =>
    [...seg.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)]
      .map(m => unxml(m[1].replace(/<hp:(fwSpace|nbSpace)\/>/g, ' ').replace(/<hp:tab[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '')))
      .join('').replace(/\s+/g, ' ').trim(),
  ).filter(Boolean).join('\n');
}

export async function hwpxText(JSZip, data) {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files).filter(n => /^Contents\/section\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!names.length) throw new Error('HWPX 본문을 찾지 못함');
  const parts = [];
  for (const n of names) parts.push(sectionText(await zip.file(n).async('string')));
  return parts.join('\n');
}
