// Cloudflare Access(구글 로그인)가 붙여 주는 JWT를 서버에서 한 번 더 검증한다.
// Access가 앞단에서 막아 주지만, 설정 실수로 우회되는 경우를 대비한 이중 확인.
import { HttpError } from './http.js';

let CERTS = { at: 0, keys: [] };

const b64urlToBytes = s => {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};
const decodePart = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function certs(team, force = false) {
  if (!force && Date.now() - CERTS.at < 3600e3 && CERTS.keys.length) return CERTS.keys;
  const r = await fetch('https://' + team + '/cdn-cgi/access/certs');
  if (!r.ok) throw new HttpError(503, 'Access 인증서를 불러오지 못함');
  CERTS = { at: Date.now(), keys: (await r.json()).keys || [] };
  return CERTS.keys;
}

function tokenFrom(request) {
  const h = request.headers.get('Cf-Access-Jwt-Assertion');
  if (h) return h;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('Cookie') || '');
  return m ? m[1] : '';
}

export async function verifyAccess(request, env) {
  const host = new URL(request.url).hostname;
  // 로컬 개발(wrangler pages dev)에서만 쓰는 우회. 배포 환경에서는 DEV_USER_EMAIL을 넣지 않는다.
  if (env.DEV_USER_EMAIL && (host === 'localhost' || host === '127.0.0.1')) return { email: env.DEV_USER_EMAIL.toLowerCase() };

  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!team || !aud) throw new HttpError(500, 'ACCESS_TEAM_DOMAIN / ACCESS_AUD 설정이 없음');
  const token = tokenFrom(request);
  if (!token) throw new HttpError(401, '로그인이 필요함');
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new HttpError(401, '잘못된 로그인 토큰');
  const header = decodePart(h), payload = decodePart(p);
  if (header.alg !== 'RS256') throw new HttpError(401, '지원하지 않는 서명 방식');

  let jwk = (await certs(team)).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await certs(team, true)).find(k => k.kid === header.kid);  // 키 교체 직후
  if (!jwk) throw new HttpError(401, '서명 키를 찾지 못함');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(h + '.' + p));
  if (!ok) throw new HttpError(401, '서명이 맞지 않음');

  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new HttpError(401, '다른 앱의 토큰');
  if (payload.iss !== 'https://' + team) throw new HttpError(401, '발급자가 다름');
  if (!payload.exp || payload.exp < now - 30) throw new HttpError(401, '로그인이 만료됨');
  if (!payload.email) throw new HttpError(401, '이메일 정보가 없음');
  return { email: String(payload.email).toLowerCase() };
}
