// 첫 화면에 필요한 공용 데이터 (시간표·학사일정·이번 달 월중계획·이번 주 관리자 일정)
import { getModel } from '../_lib/store.js';
import { capabilities } from '../_lib/roles.js';
import { json } from '../_lib/http.js';
import { addDays, todayKST } from '../../public/js/lib/dates.js';

export async function onRequestGet({ env, data }) {
  const m = await getModel(env), u = data.user, today = todayKST(), month = today.slice(0, 7);
  return json({
    me: { name: u.name, email: u.email, roles: u.roles, duty: u.duty, can: capabilities(u) },
    today,
    tt: m.tt,
    rules: m.rules,
    events: m.events,
    plans: m.plans.filter(p => p.d.slice(0, 7) === month),
    boss: m.boss.filter(b => b.d >= today && b.d <= addDays(today, 6)),
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + env.SHEET_ID + '/edit',
  });
}
