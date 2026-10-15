// 오늘 날씨 한 줄 (30분 캐시)
import { fetchWeather } from '../_lib/weather.js';
import { json } from '../_lib/http.js';

export async function onRequestGet({ env, waitUntil }) {
  const cacheKey = new Request('https://cache.hdhs.internal/weather');
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const res = json(await fetchWeather(env), { cache: 'public, max-age=1800' });
  waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
