// 그 외 자료: 목록(시트) 보기 / 공유 드라이브 폴더에 올리고 목록에 한 줄 추가
import { getModel, invalidate } from '../_lib/store.js';
import { driveUpload, sheetsAppend } from '../_lib/google.js';
import { audit } from '../_lib/audit.js';
import { HttpError, json, str } from '../_lib/http.js';
import { todayKST } from '../../public/js/lib/dates.js';

const MAX = 20 * 1024 * 1024;
const EXT = /\.(hwp|hwpx|pdf|xlsx|xls|docx|pptx|jpg|jpeg|png|zip|txt)$/i;
const CATS = ['인사', '학적', '생활', '교육과정', '평가', '정보', '행정', '기타'];

export async function onRequestGet({ env }) {
  const m = await getModel(env);
  return json({ files: m.files, cats: CATS });
}

export async function onRequestPost({ request, env, data }) {
  if (!env.DRIVE_FOLDER_ID) throw new HttpError(500, 'DRIVE_FOLDER_ID 설정이 없음');
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX + 64_000) throw new HttpError(413, '20MB까지 올릴 수 있음');
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw new HttpError(400, '파일이 없음');
  if (file.size > MAX) throw new HttpError(413, '20MB까지 올릴 수 있음');
  const name = str(file.name, 120).replace(/[\\/:*?"<>|]/g, '_');
  if (!EXT.test(name)) throw new HttpError(400, 'HWP·HWPX·PDF·오피스·이미지·ZIP 파일만 올릴 수 있음');
  const cat = CATS.includes(form.get('cat')) ? form.get('cat') : '기타';
  const title = str(form.get('title'), 80) || name.replace(/\.[^.]+$/, '');

  const up = await driveUpload(env, { name, type: file.type, bytes: await file.arrayBuffer(), folderId: env.DRIVE_FOLDER_ID });
  await sheetsAppend(env, '그외자료!A3:F', [[title, cat, up.webViewLink || '', data.user.name, todayKST(), '']]);
  invalidate();
  await audit(env, data.user.email, 'files.upload', title);
  return json({ ok: true, url: up.webViewLink });
}
