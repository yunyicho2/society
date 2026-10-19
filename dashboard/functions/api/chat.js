// 규정 챗봇: 학교 규정·양식 문서에서 찾은 조각만 근거로 답함
import { search } from '../_lib/rag.js';
import { getModel } from '../_lib/store.js';
import { matchDuties, dutyText } from '../_lib/duties.js';
import { askClaude } from '../_lib/claude.js';
import { takeQuota } from '../_lib/audit.js';
import { HttpError, json, readJson, str } from '../_lib/http.js';
import { maskPII } from '../../public/js/lib/pii.js';

const SYSTEM = `당신은 현대고등학교 교직원을 돕는 학교 규정 안내 도우미입니다.
- <문서> 안의 내용만 근거로 답합니다. 문서에 없는 내용은 "올라온 규정 문서에서 찾지 못했어요"라고 말하고, 확인할 부서(교무기획부·학생부 등)를 제안합니다.
- 답은 한국어로 짧고 분명하게, "~해요" 말투로 씁니다. 기한·일수·서류 이름은 굵게(**) 표시합니다.
- 근거로 쓴 문서 번호를 문장 끝에 [1], [2]처럼 붙입니다.
- 담당자를 묻는 질문에는 '업무분장(학교 시트)' 문서를 우선 근거로 삼고, 부서·업무·담당자 이름을 함께 답합니다.
- 학생 개인정보는 가려져 있을 수 있습니다. 가려진 글자를 추측하지 않습니다.`;

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request, 20_000);
  const q = maskPII(str(body.q, 600));
  if (!q) throw new HttpError(400, '질문이 비어 있음');
  if (!(await takeQuota(env, data.user.email, 'chat', Number(env.AI_DAILY_LIMIT || 60)))) throw new HttpError(429, '오늘 질문 한도를 넘었어요. 내일 다시 이용해 주세요');

  // 규정 문서(벡터 검색) + 학교 시트 업무분장 탭에서 관련 줄
  const [found, model] = await Promise.all([search(env, q), getModel(env)]);
  const docs = found.slice();
  const duties = matchDuties(q, model.duties || []);
  if (duties.length) docs.unshift({ title: '업무분장(학교 시트)', text: dutyText(duties) });
  if (!docs.length) return json({ answer: '올라온 규정 문서에서 관련 내용을 찾지 못했어요. 정보 담당 선생님께 문서 추가를 요청하거나 담당 부서에 확인해 주세요.', cites: [] });

  const ctx = docs.map((d, i) => '<문서 번호="' + (i + 1) + '" 제목="' + d.title.replace(/"/g, '') + '">\n' + d.text + '\n</문서>').join('\n');
  const history = (Array.isArray(body.history) ? body.history.slice(-6) : [])
    .filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
    .map(h => ({ role: h.role, content: maskPII(h.text.slice(0, 1500)) }));
  // 대화가 user로 시작하고 번갈아 나오도록 정리
  while (history.length && history[0].role !== 'user') history.shift();
  const msgs = [];
  history.forEach(h => { if (msgs.length && msgs[msgs.length - 1].role === h.role) msgs[msgs.length - 1].content += '\n' + h.content; else msgs.push(h); });
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
  msgs.push({ role: 'user', content: ctx + '\n\n질문: ' + q });

  const r = await askClaude(env, { system: SYSTEM, messages: msgs, maxTokens: 6000, effort: 'medium' });
  if (r.refused) return json({ answer: '이 질문에는 답할 수 없어요. 담당 부서에 직접 확인해 주세요.', cites: [] });
  const used = [...new Set([...r.text.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1])))].filter(n => n >= 1 && n <= docs.length);
  const cites = [...new Set((used.length ? used : [1]).map(n => docs[n - 1].title))];
  return json({ answer: r.text, cites });
}
