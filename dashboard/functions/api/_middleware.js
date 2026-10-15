// /api/* 공통: 로그인 확인 → 권한 탭에서 이름·역할 찾기 → 오류는 JSON으로
import { verifyAccess } from '../_lib/access.js';
import { getModel } from '../_lib/store.js';
import { HttpError, json } from '../_lib/http.js';

export async function onRequest(ctx) {
  try {
    const { request, env } = ctx;
    // 다른 사이트에서 몰래 보내는 쓰기 요청 차단
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, '허용되지 않은 요청 출처');
    }
    const { email } = await verifyAccess(request, env);
    const model = await getModel(env);
    const p = model.perms[email];
    if (!p) throw new HttpError(403, '등록되지 않은 계정입니다 (' + email + '). 정보 담당 선생님께 권한 탭 등록을 요청하세요.');
    ctx.data.user = { email, name: p.name, roles: p.roles, duty: p.duty };
    const res = await ctx.next();
    res.headers.set('x-content-type-options', 'nosniff');
    return res;
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
    console.error(err && err.stack || err);
    return json({ error: '서버 오류' }, { status: 500 });
  }
}
