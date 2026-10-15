# 배포 가이드 (Cloudflare Pages + Functions)

처음 한 번만 하면 됩니다. 이후에는 GitHub에 커밋하면 1~2분 뒤 자동 배포됩니다. 걸리는 시간은 1~2시간 정도입니다.

## 0. 준비물

| 무엇 | 어디서 | 비용 |
|---|---|---|
| Cloudflare 계정 | dash.cloudflare.com | 무료 (Pages·Functions·D1·Vectorize·Workers AI 무료 한도 안) |
| 구글 클라우드 프로젝트 (서비스 계정, 로그인용 OAuth) | console.cloud.google.com | 무료 |
| Claude API 키 | console.anthropic.com | 사용한 만큼 (선생님당 하루 60회 제한) |
| 나이스 교육정보 개방 포털 인증키 | open.neis.go.kr → 인증키 신청 | 무료 |
| PC에 Node.js 20 이상 | nodejs.org | 무료 |

```bash
git clone <이 저장소>
cd society/dashboard
npm ci
npx wrangler login        # 브라우저가 열리면 Cloudflare 계정으로 허용
```

## 1. 구글 서비스 계정 (시트·드라이브 읽고 쓰기)

1. console.cloud.google.com 에서 **새 프로젝트**를 만듭니다. 이름 예: `hdhs-office`.
2. **API 및 서비스 → 라이브러리**에서 `Google Sheets API`, `Google Drive API`를 각각 **사용**으로 켭니다.
3. **IAM 및 관리자 → 서비스 계정 → 서비스 계정 만들기**로 이름 `office-bot`을 만듭니다. 역할은 주지 않습니다.
4. 만든 계정의 **키 → 키 추가 → 새 키 → JSON**을 누르면 파일이 내려받아집니다. **이 파일은 비밀번호와 같습니다.** 저장소에 넣지 마세요.
5. JSON 안의 `client_email`(예: `office-bot@hdhs-office.iam.gserviceaccount.com`)을 공유 대상으로 추가합니다.
   - **학교 구글 시트** "현대고 온라인 교무실 데이터": 공유 → 이 메일 → **편집자**
   - **공유 드라이브**: 구성원 관리 → 이 메일 → **콘텐츠 관리자**
     - 서비스 계정은 '내 드라이브'에는 파일을 올릴 수 없어 공유 드라이브가 필요합니다.
     - 공유 드라이브 안에 `그 외 자료` 폴더를 만들고, 주소창의 `.../folders/<여기>` 부분을 복사해 둡니다.

## 2. 구글 로그인 (Cloudflare Access)

### 2-1. 구글 OAuth 클라이언트

1. 같은 구글 클라우드 프로젝트에서 **API 및 서비스 → OAuth 동의 화면**을 엽니다.
   - 사용자 유형: **외부**(개인 지메일로 로그인하므로). 앱 이름: `현대고 온라인 교무실`
   - 범위는 기본(email, profile, openid)만 둡니다.
   - **앱 게시(프로덕션으로 푸시)**를 누릅니다. '테스트' 상태로 두면 등록한 테스트 사용자만 로그인됩니다. 기본 범위만 쓰므로 구글 검수는 필요 없습니다.
2. **사용자 인증 정보 → OAuth 클라이언트 ID 만들기 → 웹 애플리케이션**을 고릅니다.
   - 승인된 자바스크립트 원본: `https://<팀이름>.cloudflareaccess.com`
   - 승인된 리디렉션 URI: `https://<팀이름>.cloudflareaccess.com/cdn-cgi/access/callback`
   - 만들어진 **클라이언트 ID·보안 비밀**을 복사해 둡니다.

`<팀이름>`은 Cloudflare Zero Trust를 처음 열 때 정합니다(예: `hdhs`).

### 2-2. Zero Trust 설정 (one.dash.cloudflare.com)

1. **설정 → 인증 → 로그인 방법 → 새로 추가 → Google**을 고르고, 위 클라이언트 ID·보안 비밀을 넣은 뒤 **테스트**로 확인합니다.
2. **Access → 애플리케이션 → 추가 → 자체 호스팅**을 고릅니다.
   - 애플리케이션 이름: `온라인 교무실`. 세션 시간은 `1주` 정도가 편합니다.
   - 도메인은 아래를 **모두** 추가합니다(어느 주소로 들어와도 로그인하도록).
     - `hdhs-office.pages.dev`
     - `*.hdhs-office.pages.dev` (미리보기 배포)
     - 학교 도메인을 연결했다면 그 주소 (예: `office.학교도메인`)
   - ID 공급자: **Google만** 켜고, '인스턴트 인증'을 켭니다.
   - 정책: 이름 `교직원`, 동작 **허용**. 아래 둘 중 하나를 고릅니다.
     - **간단히**: 포함 → `로그인 방법` = Google
       - 구글 계정이면 누구나 화면까지는 들어오지만, 데이터 API는 `권한` 탭에 없는 메일을 403으로 막습니다.
       - 화면 파일에는 학교 데이터가 없습니다.
     - **더 엄격히**: 포함 → `이메일` 목록에 교직원 지메일을 모두 넣습니다. 명단을 두 곳(Access, 권한 탭)에서 관리해야 합니다.
3. 만든 애플리케이션의 **개요 → 애플리케이션 대상(AUD) 태그**를 복사합니다.

`wrangler.toml`의 두 값을 채웁니다.

```toml
ACCESS_TEAM_DOMAIN = "hdhs.cloudflareaccess.com"   # <팀이름>.cloudflareaccess.com
ACCESS_AUD = "복사한 AUD 태그"
```

## 3. Cloudflare 자원 만들기

```bash
# D1 (내 설정·진도 메모·기록)
npx wrangler d1 create hdhs-office
#  → 출력된 database_id 를 wrangler.toml [[d1_databases]] 에 붙여 넣기
npm run db:migrate          # 표 만들기 (migrations/0001_init.sql)

# Vectorize (규정 챗봇 문서 벡터, bge-m3 = 1024차원)
npx wrangler vectorize create hdhs-rules --dimensions=1024 --metric=cosine
```

`wrangler.toml`에 `DRIVE_FOLDER_ID`(1-5단계에서 복사한 폴더 ID)도 넣습니다. 나이스 표준학교코드(7자리)를 알면 `NEIS_SCHOOL_CODE`를 넣으세요. 비우면 학교 이름으로 자동 조회합니다.

날씨 좌표는 기본값이 울산 동구 봉수로 455 부근입니다(`WEATHER_LAT`, `WEATHER_LON`). 지도에서 확인해 고치면 됩니다.

## 4. Pages 프로젝트 (GitHub 연결)

1. Cloudflare 대시보드 → **Workers 및 Pages → 만들기 → Pages → Git에 연결**을 누르고 이 저장소를 고릅니다.
2. 빌드 설정을 넣습니다.

| 항목 | 값 |
|---|---|
| 프로젝트 이름 | `hdhs-office` (wrangler.toml `name`과 같게) |
| 프로덕션 분기 | `main` |
| 루트 디렉터리 | `dashboard` |
| 빌드 명령 | `npm ci && npm run check && npm test` |
| 빌드 출력 디렉터리 | `public` |
| 환경 변수 | `NODE_VERSION` = `22` |

- D1·Vectorize·Workers AI 연결과 일반 변수는 `wrangler.toml`에서 자동으로 읽습니다. 대시보드에서 따로 넣지 않습니다.
- 빌드 명령의 `check`는 `dashboard.json` 문법을 검사하고, `test`는 계산 테스트입니다. 둘 중 하나라도 틀리면 배포가 멈추고 기존 화면이 그대로 유지됩니다.

> 이 기능은 지금 `claude/compassionate-mccarthy-0662bx` 분기에 있습니다. `main`에 합친 뒤 연결하거나, 프로덕션 분기를 잠시 이 분기로 지정하세요.

## 5. 비밀 값 넣기

```bash
P=--project-name=hdhs-office
jq -r .client_email  키파일.json | npx wrangler pages secret put GOOGLE_SA_EMAIL $P
jq -r .private_key   키파일.json | npx wrangler pages secret put GOOGLE_SA_KEY $P
npx wrangler pages secret put ANTHROPIC_API_KEY $P     # 붙여 넣고 Enter
npx wrangler pages secret put NEIS_API_KEY $P          # 붙여 넣고 Enter
```

- `jq`가 없으면 JSON 파일을 열어 `private_key` 값을 통째로(`-----BEGIN ...`부터 `...END PRIVATE KEY-----\n`까지) 복사해 넣어도 됩니다.
- 넣은 뒤 **배포 → 최근 배포 → 재시도**로 한 번 다시 배포합니다.

### Claude 호출 설정 (참고)
- 모델: `claude-opus-5-5`
- **서버 쪽 대체 모델이 켜져 있습니다.**
  - 설정: `fallbacks: "default"`, 베타 헤더 `server-side-fallback-2026-07-01`
  - 정책상 거절되면 API가 같은 요청을 기본 대체 모델로 한 번 더 시도합니다.
  - 대체 모델로 처리된 몫은 그 모델의 요금으로 청구됩니다.
- 하루 호출 한도: 선생님당 `AI_DAILY_LIMIT`(기본 60회). wrangler.toml에서 바꿉니다.

## 6. 처음 데이터 넣기

1. 학교 시트 `권한` 탭에 **개인 지메일**을 적습니다.
   - 먼저 정보 담당·교무부장·수업계 줄을 채웁니다.
   - 이름은 `전체시간표` 탭의 교사 이름과 **똑같이** 적어야 합니다.
2. 사이트에 로그인해 확인합니다.
   - 오늘 날짜, 식단, 날씨, 내 시간표, 진도 계산이 나오는지 봅니다.
   - 교무부장 계정이면 아침 안내 메시지가 보이는지 봅니다.
3. 정보 담당 계정에서 **관리 → 규정 챗봇 문서**에 학교 규정·양식 HWPX를 올립니다. 대상 예: 학업성적관리규정, 출결 안내, 체험학습 안내, 수업변경 안내.
4. `public/config/dashboard.json`의 기초자료·공유 드라이브 링크를 채워 커밋합니다. 링크가 빈 칸은 화면에 '준비 중'으로 보입니다.

## 7. 배포 후 확인 목록

- [ ] 시크릿 창으로 접속하면 구글 로그인 화면이 나온다
- [ ] `권한` 탭에 없는 지메일로 로그인하면 "등록되지 않은 계정" 안내가 나온다
- [ ] 교사 계정: 아침 안내 메시지가 안 보이고, 대강·교체에 '확정' 버튼이 없다
- [ ] 수업 변경 신청 → 신청 등록 → 시트 `대강교체`에 `결재 대기` 두 줄이 생긴다
- [ ] 수업계 계정: '결재 대기' 탭에서 확정 → 시트 상태가 `확정`으로 바뀐다
- [ ] 수업변경 신청서·결석 신고서 HWPX를 받아 **한글에서 열어** 글자가 제자리에 들어갔는지 본다
- [ ] 그 외 자료 올리기 → 공유 드라이브 폴더와 시트 `그외자료`에 생긴다
- [ ] 규정 챗봇 질문 → 근거 문서 이름이 함께 나온다
- [ ] `https://hdhs-office.pages.dev/api/bootstrap`을 로그인 없이 열면 막힌다

## 로컬에서 고쳐 보기 (개발자용)

```bash
cd dashboard
cat > .dev.vars <<'EOF'
DEV_USER_EMAIL="내지메일@gmail.com"
GOOGLE_SA_EMAIL="..."
GOOGLE_SA_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ANTHROPIC_API_KEY="..."
NEIS_API_KEY="..."
EOF
npm run db:migrate:local
npm run dev          # http://localhost:8788
npm test             # 계산·양식·API 테스트
```

- `.dev.vars`는 `.gitignore`에 들어 있어 커밋되지 않습니다.
- `DEV_USER_EMAIL` 우회는 `localhost`에서만 동작합니다.
- Workers AI·Vectorize는 로컬에서도 Cloudflare에 연결되므로 `wrangler login`이 되어 있어야 합니다.

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 모든 API가 401 | `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` 값. Access 애플리케이션에 지금 접속한 주소가 들어 있는지 |
| "등록되지 않은 계정" | `권한` 탭 A열 메일 철자 (대소문자는 상관없음). 반영까지 최대 1분 |
| "구글 API 오류 (403)" | 시트·공유 드라이브에 서비스 계정 메일을 공유했는지. Sheets/Drive API를 켰는지 |
| "구글 인증 실패" | `GOOGLE_SA_KEY` 줄바꿈. `jq -r .private_key`로 다시 넣기 |
| 식단이 안 나옴 | `NEIS_API_KEY`. 키가 없으면 한 번에 5건만 와서 한 달 식단이 비어 보임 |
| 시간표가 비어 있음 | `권한` 탭 이름과 `전체시간표` 탭 이름이 같은지 |
| 챗봇이 "찾지 못했어요"만 함 | 관리 → 규정 챗봇 문서에 문서가 올라가 있는지 |
| 배포가 멈춤 | Pages 빌드 로그에서 `dashboard.json` 오류 줄 확인 |
