// 신청 상태 바꾸기: 확정·반려(수업계·교무부장·관리자), 취소(신청한 본인, 결재 대기일 때만)
import { getModel, invalidate } from '../../_lib/store.js';
import { sheetsBatchUpdate } from '../../_lib/google.js';
import { can } from '../../_lib/roles.js';
import { audit } from '../../_lib/audit.js';
import { HttpError, json, readJson, str } from '../../_lib/http.js';

export async function onRequestPost({ request, env, data }) {
  const u = data.user, body = await readJson(request, 2_000);
  const id = str(body.id, 20), status = str(body.status, 10);
  if (!['확정', '반려', '취소'].includes(status)) throw new HttpError(400, '상태 값 오류');
  const m = await getModel(env, { fresh: true });
  const rows = m.subs.filter(s => s.id && s.id === id);
  if (!rows.length) throw new HttpError(404, '신청을 찾지 못함');
  if (status === '취소') {
    if (!rows.every(r => r.by === u.name || r.absent === u.name || r.who === u.name)) throw new HttpError(403, '본인 신청만 취소할 수 있음');
    if (rows.some(r => r.status !== '결재 대기')) throw new HttpError(409, '이미 처리된 신청은 수업계에 문의');
  } else if (!can.confirmSubs(u)) {
    throw new HttpError(403, '수업계(시간표 담당)만 확정할 수 있음');
  }
  await sheetsBatchUpdate(env, rows.map(r => ({ range: '대강교체!L' + r.row, values: [[status]] })));
  invalidate();
  await audit(env, u.email, 'subs.' + status, id);
  return json({ ok: true });
}
