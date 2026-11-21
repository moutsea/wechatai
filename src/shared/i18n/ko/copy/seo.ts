export const seoCopy = {
  organizationDescription:
    "AI 모델과 에이전트를 1:1 위챗 ClawBot 대화에 연결하는 독립 운영 서비스입니다. Tencent 및 WeChat과 공식 제휴 관계가 없습니다.",
  freeOfferDescription: (connections: number, plugins: number) =>
    `매일 크레딧을 제공하며 위챗 연결 ${connections}개와 플러그인 ${plugins}개를 사용할 수 있습니다.`,
  serviceName: "Wechatai 무료 및 Plus",
  serviceType: "위챗 AI 연결 서비스",
  featureList: [
    "자체 API 키와 모델 엔드포인트 사용",
    "위챗에서 모델 전환과 대화 관리",
    "OpenAI Chat Completions, Responses, Anthropic Messages 지원",
    "기존 Muse, Hermes, OpenClaw 에이전트 연결",
    "이미지 모델을 설정해 위챗에서 AI 이미지 생성 및 수신",
    "역할극 플러그인으로 캐릭터와 스토리 설정",
    "Plus 클라우드 어시스턴트 Xiaowei의 파일 처리, 문서 생성, 작업 실행(텍스트 모델 필요)",
  ],
  imageAlt: "Wechatai: 위챗에서 직접 고른 모델과 대화하세요.",
} as const;
