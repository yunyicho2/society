// 공문 작성 도우미: 메모를 공문 서식(관련·본문 항목·붙임·끝.)으로 정리
import { askClaude } from '../_lib/claude.js';
import { takeQuota } from '../_lib/audit.js';
import { HttpError, json, readJson, str } from '../_lib/http.js';
import { maskPII } from '../../public/js/lib/pii.js';

const SYSTEM = `당신은 학교 공문(기안문) 본문을 쓰는 도우미입니다. 행정업무운영편람의 공문서 작성 규칙을 따릅니다.
- 출력은 공문 본문만. 설명·인사말·마크다운 기호(#, *, **) 없이 일반 글자로만 씁니다.
- 첫 줄: "제목  ○○○". 빈 줄 다음 본문.
- 항목 기호 순서: 1. → 가. → 1) → 가) → (1). 하위 항목은 두 칸씩 들여 씁니다.
- 관련 근거가 있으면 "1. 관련: ..." 으로 시작하고 "2. 위 호와 관련하여 ..." 로 잇습니다.
- 날짜는 "2026. 10. 8.(목)", 시간은 "16:40~17:40" 처럼 24시 체계.
- 붙임이 있으면 마지막 줄을 "붙임  ○○○ 1부.  끝." 으로, 없으면 본문 끝에 두 칸 띄고 "끝." 을 붙입니다.
- 가정통신문이면 학부모님께 쓰는 높임말 안내문 형식(인사 → 안내 → 문의처)으로 쓰고 "끝."은 붙이지 않습니다.
- 메모에 없는 사실(날짜·장소·예산)을 지어내지 않습니다. 필요한데 빠진 정보는 ○○ 로 비워 둡니다.`;

export async function onRequestPost({ request, env, data }) {
  const b = await readJson(request, 20_000);
  const kind = ['내부결재', '대외발송', '가정통신문'].includes(b.kind) ? b.kind : '내부결재';
  const memo = maskPII(str(b.memo, 3000));
  if (!memo) throw new HttpError(400, '메모가 비어 있음');
  if (!(await takeQuota(env, data.user.email, 'doc', Number(env.AI_DAILY_LIMIT || 60)))) throw new HttpError(429, '오늘 사용 한도를 넘었어요');
  const prompt = '문서 종류: ' + kind + '\n제목: ' + maskPII(str(b.title, 150)) + '\n관련 근거: ' + (maskPII(str(b.ref, 200)) || '없음') + '\n\n메모:\n' + memo;
  const r = await askClaude(env, { system: SYSTEM, messages: [{ role: 'user', content: prompt }], maxTokens: 6000, effort: 'low' });
  if (r.refused) throw new HttpError(422, '이 내용으로는 초안을 만들 수 없어요');
  return json({ text: r.text });
}
