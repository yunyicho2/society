// 대강·교체 현황 읽기 / 수업 변경 신청 등록
// 교사는 자기 결강만 신청. 등록되면 상태 '결재 대기' → 수업계가 확정
import { getModel, invalidate } from '../../_lib/store.js';
import { sheetsAppend } from '../../_lib/google.js';
import { can } from '../../_lib/roles.js';
import { audit } from '../../_lib/audit.js';
import { HttpError, isDate, json, readJson, str } from '../../_lib/http.js';
import { addDays, dow, todayKST } from '../../../public/js/lib/dates.js';

export async function onRequestGet({ env }) {
  const m = await getModel(env), from = addDays(todayKST(), -14);
  return json({ subs: m.subs.filter(s => s.date >= from).sort((a, b) => a.date.localeCompare(b.date) || a.p - b.p) });
}

const REASONS = ['출장', '공가', '연가', '병가', '특별휴가', '조퇴', '외출', '기타'];

export async function onRequestPost({ request, env, data }) {
  const u = data.user, body = await readJson(request, 50_000), m = await getModel(env), today = todayKST();
  const absent = str(body.absent, 30) || u.name;
  if (absent !== u.name && !can.submitForOthers(u)) throw new HttpError(403, '본인 수업만 신청할 수 있음');
  const reason = REASONS.includes(body.reason) ? body.reason : '기타';
  const detail = str(body.detail, 100);
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 20) : [];
  if (!rows.length) throw new HttpError(400, '교체할 수업이 없음');

  // 시간표와 맞는지 서버에서 다시 확인 (화면 조작으로 남의 수업을 바꾸지 못하게)
  const at = (name, date, p) => (m.tt[name] || {})[(dow(date) - 1) + '-' + p] || '';
  rows.forEach((r, i) => {
    const n = i + 1;
    if (!isDate(r.date) || !isDate(r.toDate)) throw new HttpError(400, n + '번째 줄 날짜 오류');
    if (r.date < today || r.toDate <= today) throw new HttpError(400, n + '번째 줄: 지난 날짜는 신청할 수 없음');
    if (at(absent, r.date, r.p) !== r.subj + '|' + r.cls) throw new HttpError(400, n + '번째 줄: ' + absent + ' 선생님 시간표와 맞지 않음');
    if (!m.tt[r.who]) throw new HttpError(400, n + '번째 줄: 교체 상대 선생님을 찾지 못함');
    if (at(r.who, r.toDate, r.toP) !== r.toSubj + '|' + r.toCls) throw new HttpError(400, n + '번째 줄: ' + r.who + ' 선생님 시간표와 맞지 않음');
  });

  const id = today.replace(/-/g, '').slice(2) + '-' + crypto.randomUUID().slice(0, 4);
  const values = [];
  rows.forEach(r => {
    // 요일 열(B)은 시트 수식이 채우므로 null로 건너뜀
    values.push([r.date, null, r.p, r.cls, r.subj, absent, reason, r.who, '교체', u.name, detail, '결재 대기', id]);
    values.push([r.toDate, null, r.toP, r.toCls, r.toSubj, r.who, '교체(맞바꿈)', absent, '교체', u.name, '', '결재 대기', id]);
  });
  await sheetsAppend(env, '대강교체!A3:M', values);
  invalidate();
  await audit(env, u.email, 'subs.submit', id + ' ' + absent + ' ' + rows.length + '건');
  return json({ ok: true, id });
}
