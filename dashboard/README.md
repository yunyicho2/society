# 현대고등학교 온라인 교무실

교직원 시작 페이지입니다. 오늘 식단·일정·날씨, 업무포털 바로가기, 수업 변경 신청, 진도·차시 관리, 출결 서류, 규정 챗봇, 공문 작성 도우미를 한 화면에 모았습니다. Cloudflare Pages + Functions로 돌아가고, 공용 데이터는 학교 구글 시트, 개인 설정은 D1에 둡니다. 학생 정보는 브라우저 밖으로 나가지 않습니다.

- [구조·데이터 흐름·보안 정책](docs/ARCHITECTURE.md)
- [배포 가이드](docs/DEPLOY.md)
- [운영 안내 (담당 선생님용)](docs/OPERATIONS.md)

## 폴더

```
dashboard/
├─ public/                  정적 화면 (빌드 없음)
│  ├─ index.html
│  ├─ css/app.css           제목 눈누 기초고딕 · 본문 나눔스퀘어
│  ├─ js/                   화면 모듈 (app, cards, subs, prog, swap, forms, tools, prefs, ui)
│  │  └─ lib/               브라우저·서버·테스트 공용 계산
│  │     ├─ schedule.js     학사일정·차시·교체 후보·연강 계산
│  │     ├─ hwpx-fill.js    학교 HWPX 양식 채우기
│  │     ├─ pii.js          AI로 보내기 전 개인정보 가림
│  │     ├─ xlsx-read.js    나이스 엑셀 읽기 (브라우저 안)
│  │     └─ ...
│  ├─ templates/            빈 학교 양식 (수업변경 신청서, 결석 신고서)
│  ├─ config/dashboard.json 카드 링크·학기 날짜 (GitHub에서 고침)
│  ├─ vendor/jszip.min.js
│  ├─ _headers              보안 헤더(CSP 등)
│  └─ _routes.json          /api/* 만 Functions로
├─ functions/
│  ├─ api/                  /api/bootstrap, meals, weather, morning, prefs, progress,
│  │                        subs, subs/status, files, chat, doc-draft, admin/docs
│  └─ _lib/                 Access 검증, 구글 서명, 시트 모델, 역할, Claude, RAG
├─ migrations/              D1 표
├─ scripts/check-config.mjs 배포 전 dashboard.json 검사
├─ tests/                   node:test
└─ wrangler.toml
```

## 명령

```bash
npm ci
npm test          # 계산·양식·API 테스트
npm run check     # dashboard.json 검사
npm run dev       # 로컬 실행 (docs/DEPLOY.md '로컬에서 고쳐 보기')
```
