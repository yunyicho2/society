// 한글 .hwp(5.0, 바이너리) 문서에서 글자만 뽑기 — 규정 챗봇 문서 올리기용.
// 브라우저 안에서만 처리하고, 외부 라이브러리 없이 동작:
//   1) OLE 복합 파일(CFB)에서 FileHeader, BodyText/Section0..N 스트림을 꺼냄
//   2) 섹션은 raw deflate 압축 → DecompressionStream('deflate-raw')로 풂
//   3) 레코드 중 PARA_TEXT(태그 67)의 글자만 모음
const END = 0xfffffffe;

function cfb(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (!sig.every((b, i) => u8[i] === b)) throw new Error('한글(.hwp) 파일이 아님');
  const u32 = o => dv.getUint32(o, true);
  const ss = 1 << dv.getUint16(0x1e, true), mss = 1 << dv.getUint16(0x20, true);
  const sector = id => u8.subarray((id + 1) * ss, (id + 2) * ss);

  // FAT 섹터 목록: 헤더의 109칸 + DIFAT 사슬
  const fatIds = [];
  for (let i = 0; i < 109; i++) { const id = u32(0x4c + i * 4); if (id < END - 1) fatIds.push(id); }
  for (let d = u32(0x44), n = u32(0x48); n > 0 && d < END - 1; n--) {
    const s = sector(d), sv = new DataView(s.buffer, s.byteOffset, s.byteLength);
    for (let i = 0; i < ss / 4 - 1; i++) { const id = sv.getUint32(i * 4, true); if (id < END - 1) fatIds.push(id); }
    d = sv.getUint32(ss - 4, true);
  }
  const fat = new Uint32Array(fatIds.length * (ss / 4));
  fatIds.forEach((id, k) => { const s = sector(id); fat.set(new Uint32Array(s.buffer.slice(s.byteOffset, s.byteOffset + ss)), k * (ss / 4)); });

  const chain = (start, table) => { const out = []; for (let id = start, guard = 0; id < END - 1 && guard < table.length + 1; guard++) { out.push(id); id = table[id]; } return out; };
  const readChain = start => { const ids = chain(start, fat), out = new Uint8Array(ids.length * ss); ids.forEach((id, i) => out.set(sector(id), i * ss)); return out; };

  // 디렉터리 (항목 128바이트)
  const dir = readChain(u32(0x30)), dd = new DataView(dir.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = dd.getUint16(o + 64, true);
    let name = ''; for (let i = 0; i + 2 < len; i += 2) name += String.fromCharCode(dd.getUint16(o + i, true));
    entries.push({ name, type: dir[o + 66], left: dd.getUint32(o + 68, true), right: dd.getUint32(o + 72, true), child: dd.getUint32(o + 76, true), start: dd.getUint32(o + 116, true), size: dd.getUint32(o + 120, true) });
  }
  const root = entries[0];
  const miniStream = readChain(root.start);
  const miniFat = (() => { const b = readChain(u32(0x3c)); return u32(0x3c) >= END - 1 ? new Uint32Array(0) : new Uint32Array(b.buffer, 0, b.length / 4); })();
  const cutoff = u32(0x38);

  function read(e) {
    if (e.size < cutoff) {
      const ids = chain(e.start, miniFat), out = new Uint8Array(ids.length * mss);
      ids.forEach((id, i) => out.set(miniStream.subarray(id * mss, (id + 1) * mss), i * mss));
      return out.subarray(0, e.size);
    }
    return readChain(e.start).subarray(0, e.size);
  }
  // 저장소(폴더) 아래 항목 이름표 (레드-블랙 트리를 순회)
  function children(e) {
    const out = {}, stack = [e.child];
    while (stack.length) { const i = stack.pop(); if (i >= END - 1 || !entries[i]) continue; const c = entries[i]; out[c.name] = c; stack.push(c.left, c.right); }
    return out;
  }
  return { root, children, read };
}

async function inflateOnce(bytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = []; let total = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); total += value.length; }
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
// 한글 섹션은 압축 데이터 뒤에 몇 바이트(보통 8)가 더 붙어 있음. 크롬은 그 경우 오류를 내면서
// 마지막 출력 일부를 버리므로, 뒤 바이트를 하나씩 잘라 오류 없이 풀리는 길이를 찾음
async function inflateRaw(bytes) {
  let last;
  for (let k = 0; k <= 32 && k < bytes.length; k++) {
    try { return await inflateOnce(bytes.subarray(0, bytes.length - k)); }
    catch (e) { last = e; if (!/junk/i.test(String(e && e.message)) && k > 0) break; }
  }
  throw new Error('한글 문서 압축을 풀지 못함' + (last ? ' (' + last.message + ')' : ''));
}

export function paraTexts(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength), out = [];
  let i = 0;
  while (i + 4 <= data.length) {
    const h = dv.getUint32(i, true); i += 4;
    const tag = h & 0x3ff; let size = (h >>> 20) & 0xfff;
    if (size === 0xfff) { size = dv.getUint32(i, true); i += 4; }
    if (tag === 67) {
      let s = '';
      for (let j = i; j + 1 < i + size;) {
        const c = dv.getUint16(j, true);
        if (c < 32) {
          // 확장 제어 문자(표·그림 등)는 16바이트, 나머지는 2바이트
          j += [0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31].includes(c) ? 2 : 16;
          if (c === 9) s += ' ';
          continue;
        }
        if (!(c >= 0xd800 && c <= 0xdfff) && !(c >= 0xe000 && c <= 0xf8ff)) s += String.fromCharCode(c);
        j += 2;
      }
      s = s.replace(/\s+/g, ' ').trim();
      if (s) out.push(s);
    }
    i += size;
  }
  return out;
}

export async function hwpText(data) {
  const f = cfb(data), top = f.children(f.root);
  if (!top.FileHeader) throw new Error('한글 문서 머리 정보를 찾지 못함');
  const flags = f.read(top.FileHeader)[36];
  if (flags & 2) throw new Error('암호가 걸린 한글 문서는 읽을 수 없음');
  if (!top.BodyText) throw new Error('본문을 찾지 못함 (배포용 문서는 한글에서 일반 문서로 다시 저장해 주세요)');
  const secs = Object.values(f.children(top.BodyText)).filter(e => /^Section\d+$/.test(e.name))
    .sort((a, b) => Number(a.name.slice(7)) - Number(b.name.slice(7)));
  const lines = [];
  for (const s of secs) {
    let d = f.read(s);
    if (flags & 1) d = await inflateRaw(d);
    lines.push(...paraTexts(d));
  }
  return lines.join('\n');
}
