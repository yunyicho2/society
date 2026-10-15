// 구글 서비스 계정으로 시트·드라이브 호출 (WebCrypto RS256 서명, 외부 라이브러리 없음)
import { HttpError } from './http.js';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';
let TOKEN = { value: '', exp: 0 };

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlStr = s => b64url(new TextEncoder().encode(s));

async function importKey(pem) {
  const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

export async function accessToken(env) {
  if (TOKEN.value && TOKEN.exp - 60 > Date.now() / 1000) return TOKEN.value;
  if (!env.GOOGLE_SA_EMAIL || !env.GOOGLE_SA_KEY) throw new HttpError(500, 'GOOGLE_SA_EMAIL / GOOGLE_SA_KEY 설정이 없음');
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64urlStr(JSON.stringify({ iss: env.GOOGLE_SA_EMAIL, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await importKey(env.GOOGLE_SA_KEY), new TextEncoder().encode(head + '.' + claim));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + claim + '.' + b64url(sig),
  });
  if (!r.ok) throw new HttpError(502, '구글 인증 실패 (' + r.status + ')');
  const j = await r.json();
  TOKEN = { value: j.access_token, exp: now + (j.expires_in || 3600) };
  return TOKEN.value;
}

async function gfetch(env, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: 'Bearer ' + await accessToken(env) } });
  if (!r.ok) {
    const msg = await r.text().catch(() => '');
    console.error('google api', r.status, url, msg.slice(0, 500));
    throw new HttpError(502, '구글 API 오류 (' + r.status + ')');
  }
  return r.json();
}

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';

// 날짜는 일련번호, 숫자·불리언은 원래 값으로 받음 (표시 형식에 따라 값이 바뀌지 않게)
export async function sheetsBatchGet(env, ranges) {
  const q = ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&');
  const j = await gfetch(env, SHEETS + env.SHEET_ID + '/values:batchGet?' + q + '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
  return (j.valueRanges || []).map(v => v.values || []);
}

// null 값은 건너뜀 → 요일(ARRAYFORMULA) 열을 덮어쓰지 않음
export async function sheetsAppend(env, range, rows) {
  return gfetch(env, SHEETS + env.SHEET_ID + '/values/' + encodeURIComponent(range) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: rows }),
  });
}

export async function sheetsBatchUpdate(env, data) {
  return gfetch(env, SHEETS + env.SHEET_ID + '/values:batchUpdate', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
}

// 공유 드라이브 폴더에 파일 올리기 (서비스 계정을 그 폴더의 '콘텐츠 관리자'로 추가해 둬야 함)
export async function driveUpload(env, { name, type, bytes, folderId }) {
  const boundary = 'hdhs' + crypto.randomUUID().replace(/-/g, '');
  const meta = JSON.stringify({ name, parents: [folderId] });
  const enc = new TextEncoder();
  const head = enc.encode('--' + boundary + '\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\ncontent-type: ' + (type || 'application/octet-stream') + '\r\n\r\n');
  const tail = enc.encode('\r\n--' + boundary + '--');
  const body = new Uint8Array(head.length + bytes.byteLength + tail.length);
  body.set(head, 0); body.set(new Uint8Array(bytes), head.length); body.set(tail, head.length + bytes.byteLength);
  return gfetch(env, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink', {
    method: 'POST', headers: { 'content-type': 'multipart/related; boundary=' + boundary }, body,
  });
}
