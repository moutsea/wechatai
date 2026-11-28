import { type TranslationPage } from "../index";

const pages = [
  ["", "워크스페이스", "AI 모델, 에이전트 및 WeChat 연결을 관리하세요."],
  ["/channels", "채널 및 모델", "모델 제공업체의 연결과 모델 설정을 관리하세요."],
  ["/assistants", "채널 및 모델", "모델 제공업체의 연결과 모델 설정을 관리하세요."],
  ["/plugins", "플러그인", "WeChat에서 사용할 플러그인과 에이전트를 설정하세요."],
  ["/tasks", "클라우드 작업", "클라우드 작업의 진행 상황과 결과를 확인하세요."],
  ["/wechat", "WeChat 연결", "WeChat 연결과 사용할 모델을 관리하세요."],
  ["/sessions", "대화 기록", "대화 기록을 확인하고 관리하세요."],
  ["/billing", "멤버십 및 크레딧", "사용 가능한 크레딧과 멤버십을 확인하세요."],
  ["/credits", "크레딧 내역", "지급, 사용 및 충전 내역을 확인하세요."],
  ["/invite", "친구 초대", "친구를 초대하고 초대 보상을 확인하세요."],
  ["/notices", "알림", "제품 업데이트와 서비스 공지를 확인하세요."],
  ["/admin", "관리자 페이지", "서비스 운영 현황을 확인하세요."],
];

export default pages.map(([section, title, description]) => ({
  path: `/app${section}`,
  title: `${title} | Wechatai`,
  description,
  updatedAt: "2026-11-28",
})) satisfies readonly TranslationPage[];
