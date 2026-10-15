// 시트 전체를 한 번에 읽어 60초 동안 재사용 (요청마다 구글 API를 부르지 않게)
import { sheetsBatchGet } from './google.js';
import { RANGES, buildModel } from './model.js';

const TTL = 60e3;
let MEMO = { at: 0, model: null, pending: null };

export async function getModel(env, { fresh = false } = {}) {
  if (!fresh && MEMO.model && Date.now() - MEMO.at < TTL) return MEMO.model;
  if (MEMO.pending) return MEMO.pending;
  const keys = Object.keys(RANGES);
  MEMO.pending = sheetsBatchGet(env, keys.map(k => RANGES[k]))
    .then(values => {
      const v = {}; keys.forEach((k, i) => (v[k] = values[i]));
      MEMO = { at: Date.now(), model: buildModel(v), pending: null };
      return MEMO.model;
    })
    .catch(err => { MEMO.pending = null; throw err; });
  return MEMO.pending;
}

// 시트에 쓴 직후에는 다음 읽기에서 새로 불러오게 함
export function invalidate() { MEMO = { at: 0, model: null, pending: null }; }
