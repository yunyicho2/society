// 아침 안내 메시지 — 교무부장만. 당번표 이름은 다른 역할에게 내려보내지 않음
import { getModel } from '../_lib/store.js';
import { can } from '../_lib/roles.js';
import { HttpError, isDate, json } from '../_lib/http.js';
import { todayKST } from '../../public/js/lib/dates.js';
import { morningMsg } from '../../public/js/lib/morning.js';

export async function onRequestGet({ request, env, data }) {
  if (!can.morning(data.user)) throw new HttpError(403, '교무부장만 볼 수 있음');
  const q = new URL(request.url).searchParams.get('date');
  const date = isDate(q) ? q : todayKST();
  const m = await getModel(env);
  const events = m.events.filter(e => e.s <= date && date <= e.e);
  const plans = m.plans.filter(p => p.d === date && p.morning);
  return json({ date, text: morningMsg(date, m.duty[date], events, plans) });
}
