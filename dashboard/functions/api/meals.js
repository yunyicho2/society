// 급식 (중식·석식). 한 달 단위로 받아 6시간 캐시
import { fetchMeals } from '../_lib/neis.js';
import { json } from '../_lib/http.js';
import { todayKST } from '../../public/js/lib/dates.js';

export async function onRequestGet({ request, env, waitUntil }) {
  const q = new URL(request.url).searchParams.get('month');
  const month = /^\d{4}-\d{2}$/.test(q || '') ? q : todayKST().slice(0, 7);
  const cacheKey = new Request('https://cache.hdhs.internal/meals/' + month);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const meals = await fetchMeals(env, month + '-01', month + '-' + String(last).padStart(2, '0'));
  const res = json({ month, meals }, { cache: 'private, max-age=1800' });
  const shared = new Response(res.clone().body, res);
  shared.headers.set('cache-control', 'public, max-age=21600');
  waitUntil(cache.put(cacheKey, shared));
  return res;
}
