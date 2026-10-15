// 나이스 교육정보 개방 포털 급식 API
// 기관코드(H100000120)는 내부 코드라 API에는 7자리 표준학교코드(SD_SCHUL_CODE)가 필요 → 학교 이름으로 한 번 찾아 둠
import { HttpError } from './http.js';

const HUB = 'https://open.neis.go.kr/hub/';
let SCHOOL_CODE = '';

function url(env, svc, params) {
  const q = new URLSearchParams({ Type: 'json', pIndex: '1', pSize: '100', ...params });
  if (env.NEIS_API_KEY) q.set('KEY', env.NEIS_API_KEY);
  return HUB + svc + '?' + q;
}
const rowsOf = (j, svc) => ((j[svc] || [])[1] || {}).row || [];

export async function schoolCode(env) {
  if (env.NEIS_SCHOOL_CODE) return env.NEIS_SCHOOL_CODE;
  if (SCHOOL_CODE) return SCHOOL_CODE;
  const r = await fetch(url(env, 'schoolInfo', { ATPT_OFCDC_SC_CODE: env.NEIS_ATPT || 'H10', SCHUL_NM: env.SCHOOL_NAME || '현대고등학교' }));
  if (!r.ok) throw new HttpError(502, '나이스 학교 정보 조회 실패');
  const row = rowsOf(await r.json(), 'schoolInfo').find(x => x.SCHUL_NM === (env.SCHOOL_NAME || '현대고등학교'));
  if (!row) throw new HttpError(502, '나이스에서 학교를 찾지 못함 (NEIS_SCHOOL_CODE를 직접 넣어 주세요)');
  SCHOOL_CODE = row.SD_SCHUL_CODE;
  return SCHOOL_CODE;
}

// '한방오리탕 (2.5.6.13)' → ['한방오리탕', '2.5.6.13']
export function parseDish(s) {
  const t = String(s).replace(/<[^>]+>/g, '').replace(/\*/g, '').trim();
  const m = /^(.*?)\s*\(([\d.\s]+)\)\s*$/.exec(t);
  return m ? [m[1].trim(), m[2].replace(/\s+/g, '').replace(/\.$/, '')] : [t, ''];
}

// { 'YYYY-MM-DD': { 중식: { menu:[[이름, 알레르기]], kcal }, 석식: {...} } }
export function parseMeals(j) {
  const out = {};
  rowsOf(j, 'mealServiceDietInfo').forEach(r => {
    const d = r.MLSV_YMD.slice(0, 4) + '-' + r.MLSV_YMD.slice(4, 6) + '-' + r.MLSV_YMD.slice(6, 8);
    const kind = r.MMEAL_SC_NM; if (kind !== '중식' && kind !== '석식') return;
    (out[d] = out[d] || {})[kind] = {
      menu: String(r.DDISH_NM).split(/<br\s*\/?>/i).map(parseDish).filter(x => x[0]),
      kcal: String(r.CAL_INFO || '').replace(/\s*kcal/i, '').trim(),
    };
  });
  return out;
}

export async function fetchMeals(env, from, to) {
  const code = await schoolCode(env);
  const r = await fetch(url(env, 'mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: env.NEIS_ATPT || 'H10', SD_SCHUL_CODE: code,
    MLSV_FROM_YMD: from.replace(/-/g, ''), MLSV_TO_YMD: to.replace(/-/g, ''),
  }));
  if (!r.ok) throw new HttpError(502, '나이스 급식 조회 실패');
  return parseMeals(await r.json());
}
