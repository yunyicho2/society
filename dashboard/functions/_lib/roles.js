// 역할별로 할 수 있는 일. 역할은 학교 시트 '권한' 탭에서 정함 (정보 담당이 관리).
//   교사         : 모든 교직원 기본 역할. 내 설정·진도, 내 수업 변경 신청, 그 외 자료 올리기
//   시간표 담당  : 수업계. 대강·교체 확정/반려, 다른 교사 대신 신청 입력
//   교무부장     : 아침 안내 메시지, 대강·교체 확정
//   정보 담당    : 규정 챗봇 문서 관리
//   관리자       : 교장·교감. 대강·교체 확정, 규정 문서 관리
const has = (user, ...roles) => roles.some(r => user.roles.includes(r));

export const can = {
  confirmSubs: u => has(u, '시간표 담당', '교무부장', '관리자'),
  submitForOthers: u => has(u, '시간표 담당'),
  morning: u => has(u, '교무부장'),
  manageDocs: u => has(u, '정보 담당', '관리자'),
};

export function capabilities(user) {
  return Object.fromEntries(Object.entries(can).map(([k, f]) => [k, f(user)]));
}
