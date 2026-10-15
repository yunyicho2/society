// Open-Meteo 날씨·대기질 (키 없이 사용). 좌표 기본값은 울산 동구 봉수로 455 부근
import { HttpError } from './http.js';

const WMO = [
  [[0], '맑음', 'sun'], [[1], '대체로 맑음', 'sun'], [[2], '구름 조금', 'part'], [[3], '흐림', 'cloud'],
  [[45, 48], '안개', 'fog'], [[51, 53, 55, 56, 57], '이슬비', 'rain'], [[61, 63, 65, 66, 67, 80, 81, 82], '비', 'rain'],
  [[71, 73, 75, 77, 85, 86], '눈', 'snow'], [[95, 96, 99], '뇌우', 'storm'],
];
export const wmo = c => { const f = WMO.find(([cs]) => cs.includes(c)); return f ? { text: f[1], icon: f[2] } : { text: '-', icon: 'cloud' }; };

// 환경부 기준 (㎍/㎥): 미세먼지 30/80/150, 초미세먼지 15/35/75 — 둘 중 나쁜 쪽
export function dustGrade(pm10, pm25) {
  const lv = (v, cuts) => (v == null ? -1 : cuts.findIndex(c => v <= c) === -1 ? 3 : cuts.findIndex(c => v <= c));
  const g = Math.max(lv(pm10, [30, 80, 150]), lv(pm25, [15, 35, 75]));
  return g < 0 ? '' : ['좋음', '보통', '나쁨', '매우 나쁨'][g];
}

export async function fetchWeather(env) {
  const lat = env.WEATHER_LAT || '35.5275', lon = env.WEATHER_LON || '129.4280';
  const [w, a] = await Promise.all([
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1'),
    fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon + '&current=pm10,pm2_5&timezone=Asia%2FSeoul'),
  ]);
  if (!w.ok) throw new HttpError(502, '날씨 조회 실패');
  const wj = await w.json(), aj = a.ok ? await a.json() : {};
  const c = wmo(wj.current?.weather_code);
  return {
    temp: Math.round(wj.current?.temperature_2m), text: c.text, icon: c.icon,
    min: Math.round(wj.daily?.temperature_2m_min?.[0]), max: Math.round(wj.daily?.temperature_2m_max?.[0]),
    rain: wj.daily?.precipitation_probability_max?.[0] ?? null,
    dust: dustGrade(aj.current?.pm10, aj.current?.pm2_5),
  };
}
