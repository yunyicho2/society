// Claude 호출 공통부. 학생 개인정보는 호출 전에 가려서 보낸다 (pii.js).
import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from './http.js';

export const MODEL = 'claude-opus-5-5';

export async function askClaude(env, { system, messages, maxTokens = 8000, effort = 'medium' }) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(500, 'ANTHROPIC_API_KEY 설정이 없음');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let res;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      // 정책상 거절되면 같은 요청을 서버 쪽 기본 대체 모델로 한 번 더 시도
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort },
      system,
      messages,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'AI 사용량이 많아 잠시 뒤 다시 시도해 주세요');
    if (err instanceof Anthropic.BadRequestError) { console.error('claude 400', err.message); throw new HttpError(502, 'AI 요청 형식 오류'); }
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(500, 'AI API 키가 올바르지 않음');
    if (err instanceof Anthropic.APIError) { console.error('claude', err.status, err.message); throw new HttpError(502, 'AI 서버 오류'); }
    throw err;
  }
  if (res.stop_reason === 'refusal') return { refused: true, text: '' };
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return { refused: false, text, truncated: res.stop_reason === 'max_tokens', model: res.model };
}
