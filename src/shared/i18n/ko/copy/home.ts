/**
 * Korean copy for the homepage, shared by the rendered page and its JSON-LD.
 *
 * Prices and allowances are always derived from the existing billing, credit,
 * WeChat-link and plugin-limit modules. This file only supplies wording; it is
 * not a second source for amounts or commercial terms.
 */
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN, approxYuan } from "../../../pricing-copy";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const yearlySaving = Number((PLUS_MONTHLY_YUAN * 12 - PLUS_YEARLY_YUAN).toFixed(1));

export const providerLabels: Record<string, string> = {
  kimi: "Kimi",
  zhipu: "Zhipu GLM",
  qwen: "알리바바 클라우드 모델 스튜디오",
  volcengine: "볼케노 엔진 아크",
  anthropic: "Anthropic",
  gemini: "Gemini",
  xai: "Grok / xAI",
  siliconflow: "SiliconFlow",
};

export interface KoreanFaqItem {
  question: string;
  answer: string;
  guide: { href: string; label: string };
}

export const homeCopy = {
  seo: {
    title: "위챗 AI: DeepSeek, Claude, GPT와 에이전트 | Wechatai",
    description:
      "Wechatai는 모델과 에이전트를 위챗에 연결합니다. DeepSeek, Claude, GPT와 대화하고 이미지를 생성하며 Muse, Hermes, OpenClaw를 연결하고 Plus 클라우드 어시스턴트 Xiaowei에게 파일과 작업을 맡기세요. 자체 모델 API 키로 무료로 시작하며 모델 요금은 서비스 제공자가 별도로 청구합니다.",
  },
  plans: {
    free: {
      name: "무료",
      description: "일상적인 질문부터 시작",
      unit: "영구 무료",
      note: "멤버십 없이 바로 시작할 수 있습니다",
      badge: "기본 체험",
      action: "무료로 시작",
    },
    month: {
      name: "Plus 월간",
      description: "더 많은 크레딧, 더 많은 가능성",
      unit: "/ 월",
      note: "1개월 단위로 구매하며 필요할 때 갱신합니다.",
      badge: "유연한 선택",
      action: "월간 Plus 선택",
    },
    year: {
      name: "Plus 연간",
      description: "매일 함께하는 AI",
      unit: "/ 년",
      note: `월 약 ${approxYuan((PLUS_YEARLY_YUAN * 100) / 12)}`,
      badge: `월간 대비 ¥${yearlySaving} 절약`,
      action: "연간 Plus 선택",
    },
    features: {
      creditsPrefix: "매일",
      creditsSuffix: "크레딧",
      wechatConnections: () => "개 위챗 연결",
      unlimitedPlugins: "플러그인 설정",
      unlimitedPluginsEmphasis: "무제한",
      pluginConfigurations: () => "개 플러그인 설정",
      imageInput: "이미지 및 파일 입력",
      noImageInput: "이미지 및 파일 입력 미지원",
      xiaoweiName: "Xiaowei AI",
      xiaoweiCloud: "클라우드 어시스턴트",
      noXiaowei: "Xiaowei AI 미포함",
    },
    switchLabel: "Plus 결제 주기",
    monthly: "월간",
    yearly: "연간 · 더 저렴",
  },
  hero: {
    titleLead: "당신의 AI를",
    titleAccent: "위챗으로",
    body: "Wechatai는 모델과 에이전트를 위챗에 연결해 채팅, 이미지 생성, Xiaowei의 클라우드 파일·작업 처리를 지원합니다. DeepSeek, Claude, GPT, Muse, Hermes, OpenClaw를 하나의 계정으로 연결하세요.",
    ctaWorkspace: "워크스페이스 열기",
    ctaStart: "시작하기",
    how: "연결 방법 보기",
    note: `매일 ${DAILY_CREDIT_DEFAULTS.free} 크레딧을 무료로 제공합니다. 모델 API 키는 직접 준비하며 모델 요금은 서비스 제공자가 별도로 청구합니다.`,
    imageAlt:
      "DeepSeek, Claude, GPT, Muse, Hermes, OpenClaw가 위쪽에서 연결선을 통해 아래 위챗으로 이어집니다.",
  },
  ctaSteps: "무료로 시작",
  pricingSection: {
    title: "무료로 시작하고 Plus로 더 많은 기능을 여세요",
    intro:
      "일상적인 질문은 무료 플랜으로 시작하세요. 더 많은 크레딧과 위챗 연결, Xiaowei AI가 필요하면 Plus를 선택하세요.",
    note: "크레딧은 Wechatai의 플랫폼 사용량이며 사용한 만큼 차감됩니다. 멤버십은 1회 구매로 자동 갱신되지 않으며 일일 크레딧은 이월되지 않습니다. 모델 API 요금은 서비스 제공자에게 별도로 지불합니다.",
    noteSecond:
      "Xiaowei AI는 직접 설정한 모델을 사용하며 실행 횟수와 서비스 상태는 플러그인 페이지에서 확인할 수 있습니다. 월간과 연간 플랜의 혜택은 같습니다.",
    estimate: "크레딧은 어떻게 쓸까요? 하루 사용량 예측",
    details: "전체 가격과 크레딧 확인",
  },
  privacy: {
    title: "데이터 보안과 개인정보 보호",
    intro: "키 저장 방식, 대화 처리 방식, 기록 삭제 방법을 확인하세요.",
    policy: "개인정보 처리방침 보기",
    items: {
      keys: {
        title: "키 암호화 저장",
        body: "API 키와 위챗 연결 자격 증명은 서버에 암호화되어 저장됩니다. 저장된 키는 브라우저로 다시 전송되지 않습니다.",
      },
      inspection: {
        title: "사전 검토 없음",
        body: "당사는 사용자의 대화나 첨부 파일을 사전에 검토하지 않습니다. 메시지는 자동으로 처리되어 연결된 서비스로 전달되며, 필요한 대화 및 작업 기록은 개인정보 처리방침에 따라 보관됩니다.",
      },
      deletion: {
        title: "대화 기록 삭제",
        body: "워크스페이스에서 Wechatai 대화 기록을 지울 수 있습니다. 위챗과 제3자 서비스에 보관된 사본은 별도로 처리해야 합니다.",
      },
    },
    openSource: {
      title: "GitHub 오픈 소스",
      body: "Wechatai는 MIT 라이선스로 공개된 오픈 소스입니다. 코드를 살펴보고 문제를 알리거나 개선에 참여하세요.",
      repositoryAria: "moutsea/wechatai GitHub 저장소 보기(새 창에서 열림)",
    },
  },
  faqSection: {
    title: "자주 묻는 질문",
    intro: "요금, 설정, 사용 방법에 대한 안내입니다.",
    more: "전체 FAQ 보기",
  },
  faq: [
    {
      question: "모델 API 키를 직접 준비해야 하나요?",
      answer:
        "일반 모델 채팅과 Xiaowei에는 Wechatai에 직접 준비한 모델 API 키를 설정해야 하며 모델 요금은 서비스 제공자가 별도로 청구합니다. 기존 Muse, Hermes, OpenClaw 연결은 각자의 모델 설정을 그대로 사용합니다. 서비스 알림만 받는 경우에는 모델 키가 필요하지 않습니다.",
      guide: { href: "/docs/channels-models", label: "API 키와 모델 설정 가이드 보기" },
    },
    {
      question: "무료 플랜에도 크레딧이 있나요? 만료되나요?",
      answer: `있습니다. 무료 플랜은 영구 무료이며 매일 ${DAILY_CREDIT_DEFAULTS.free} 크레딧, 위챗 연결 ${WECHAT_LINK_LIMITS.free}개, 플러그인 설정 ${PLUGIN_LIMITS.free}개를 제공합니다. 일일 크레딧은 당일만 유효하며 이월되지 않고, 모델 API 요금은 서비스 제공자가 별도로 청구합니다.`,
      guide: { href: "/pricing#estimate", label: "하루 사용량 예측하기" },
    },
    {
      question: "Plus는 얼마이며 무엇이 추가되나요?",
      answer: `Plus는 월 ¥${PLUS_MONTHLY_YUAN} 또는 연 ¥${PLUS_YEARLY_YUAN}이며 매일 ${DAILY_CREDIT_DEFAULTS.plus} 크레딧, 위챗 연결 ${WECHAT_LINK_LIMITS.plus}개, 무제한 플러그인 설정, 이미지 및 파일 입력, Xiaowei AI 클라우드 어시스턴트를 제공합니다. Xiaowei에는 설정된 모델이 필요하며 모델 API 요금은 별도로 청구됩니다. 월간과 연간 플랜의 혜택은 같고 모두 1회 구매로 자동 갱신되지 않습니다.`,
      guide: { href: "/docs/cloud-agent", label: "Xiaowei로 할 수 있는 일 알아보기" },
    },
    {
      question: "어떤 모델을 지원하나요?",
      answer:
        "DeepSeek, Claude, GPT와 Kimi, Qwen, MiniMax 등을 연결하고 같은 위챗 계정에서 전환할 수 있습니다. 공식 제공자와 호환 제공자를 지원하며 사용 가능한 모델은 제공자와 API 키에 따라 다릅니다. 이미지와 도구 지원도 모델과 제공자에 따라 달라집니다.",
      guide: { href: "/docs/channels-models", label: "지원 제공자와 모델 보기" },
    },
    {
      question: "가입부터 위챗 채팅까지 몇 단계인가요?",
      answer:
        "일반 채팅은 모델 설정, 위챗 스캔 연결, 메시지 전송의 세 단계입니다. 시작 전에 위챗에 ClawBot 메뉴가 있는지 확인하고 API 키를 준비하세요. 휴대폰에서는 컴퓨터나 다른 기기로 QR 코드를 표시합니다. 기존 에이전트는 해당 가이드를 따르면 되며 여기서 모델을 따로 설정할 필요가 없습니다.",
      guide: { href: "/docs/getting-started", label: "시작 가이드 따라 하기" },
    },
    {
      question: "가입 전에 둘러볼 수 있나요?",
      answer:
        "네. 공개 가이드에는 설정 단계와 실제 화면 스크린샷이 있어 계정 없이 읽을 수 있으며, 홈페이지의 대화, 작업, QR 미리보기는 기능 예시입니다. 가입과 스캔에는 모델 키가 필요하지 않고 일반 채팅이나 Xiaowei 작업 실행 전에 모델을 설정하면 됩니다.",
      guide: { href: "/docs/getting-started", label: "설정 단계와 화면 보기" },
    },
    {
      question: "API 키와 채팅 기록은 어디에 저장되나요?",
      answer:
        "API 키는 Wechatai 서버에 암호화되어 저장되며 직접 설정한 제공자로 요청을 보내는 데 사용됩니다. 키는 브라우저로 전송되지 않습니다. 채팅 기록은 계정에 속하며 무료 플랜은 웹에서 전체 기록을 볼 수 없지만 대화를 삭제할 수 있습니다. Wechatai 기록을 삭제해도 위챗이나 제공자가 보관한 사본은 삭제되지 않습니다.",
      guide: { href: "/privacy", label: "개인정보 처리방침 보기" },
    },
  ] satisfies readonly KoreanFaqItem[],
  steps: {
    eyebrow: "간편 시작",
    title: "2분 설정, 무료로 시작",
    guide: "시작 가이드 보기",
    requirementsPrefix: "먼저 위챗에",
    requirementsLink: "ClawBot 메뉴",
    requirementsSuffix:
      "가 있는지 확인하세요. 일반 채팅에는 직접 준비한 모델 API 키가 필요합니다. 휴대폰으로 스캔할 때는 컴퓨터나 다른 기기에서 QR 코드를 표시하세요.",
    tabsLabel: "설정 단계",
    items: [
      {
        title: "사용하는 모델 연결",
        tab: "모델 설정",
        description:
          "DeepSeek, SiliconFlow, 알리바바 클라우드, OpenAI, Anthropic 등 제공자를 지원합니다. API 키를 입력하고 한 번에 모델을 동기화하세요.",
        guideLabel: "모델 설정 가이드 보기",
      },
      {
        title: "위챗 연결",
        tab: "위챗 연결",
        description:
          "워크스페이스에서 QR 코드를 받아 위챗 ClawBot으로 확인하세요. 휴대폰에서는 다른 기기로 QR 코드를 표시하세요.",
        guideLabel: "위챗 연결 가이드 보기",
      },
      {
        title: "평소처럼 대화",
        tab: "대화 시작",
        description:
          "위챗 대화를 열고 AI에게 바로 질문하세요. 명령 하나로 모델을 바꾸거나 새 주제를 시작할 수 있습니다.",
        guideLabel: "위챗 명령 참고 보기",
      },
    ],
    preview: {
      providersTitle: "지원 모델 제공자",
      providersNote: "Coding Plan과 사용자 정의 호환 제공자도 지원합니다",
      connectLabel: "연결 미리보기",
      connectTitle: "스캔하여 위챗 연결",
      connectHint: "위챗 ClawBot으로 스캔 · 휴대폰에서 확인",
      connectNote: "예시 화면이며 실제 QR 코드는 워크스페이스에서 받으세요",
      connectSuccess: "개인 전용 연결",
      chatBrand: "Wechatai",
      chatSent: "주말 나들이 아이디어 세 가지를 알려줘.",
      chatReceived: "좋아요. 야외로 나가는 쪽과 도시를 천천히 걷는 쪽 중 어느 쪽이 좋으세요?",
      chatNote: "새 대화가 시작되었습니다. 이전 대화는 그대로 보관됩니다.",
    },
    previous: "이전 단계",
    next: "다음 단계",
    status: (index: number, total: number, title: string) =>
      `전체 ${total}단계 중 ${index}단계: ${title}`,
    alternativesPrefix: "모델을 설정하고 위챗을 연결한 뒤 대화를 시작하세요. 또는",
    alternativesAgent: "기존 에이전트 연결",
    alternativesMiddle: "하거나",
    alternativesNotifications: "서비스 알림 받기",
    alternativesEnd: "도 가능합니다.",
  },
  useCases: {
    title: "다양한 AI, 더 많은 선택",
    intro: "한마디 질문부터 작업 완료까지.",
    caption: "위 대화, 모델 선택, 작업 결과는 기능 예시입니다.",
    items: [
      {
        lead: "하나의 위챗",
        title: "여러 에이전트 연결",
        description:
          "Muse, Hermes, OpenClaw를 기존 도구와 설정 그대로 사용하며 위챗에서 작업을 보내고 결과를 받으세요.",
        action: "기존 에이전트 연결",
      },
      {
        lead: "한 줄 설명",
        title: "위챗에서 이미지 생성",
        description:
          "장면을 설명하면 위챗에서 이미지를 받습니다. 역할극을 켜 캐릭터와 스토리를 꾸밀 수도 있습니다.",
        note: "이미지 생성에는 이미지 모델이 필요하며 API 요금은 서비스 제공자가 별도로 청구합니다",
        action: "AI 이미지 생성 알아보기",
      },
      {
        lead: "DeepSeek, Claude, GPT",
        title: "최고의 모델을 직접 선택",
        description:
          "자체 모델 API를 연결하고 같은 위챗 계정에서 모델을 바꾸며 질문, 글쓰기, 번역에 활용하세요.",
        note: "API 키를 직접 준비하며 모델 요금은 서비스 제공자가 별도로 청구합니다",
        action: "모델 설정 보기",
      },
      {
        lead: "클라우드 어시스턴트 Xiaowei",
        title: "파일 처리와 문서 작성",
        description:
          "작업을 맡기고 파일을 위챗으로 받으세요. 설치나 배포는 필요 없습니다. 서비스가 열리면 Plus 회원은 자신의 텍스트 모델을 설정한 뒤 플러그인 페이지에서 Xiaowei를 직접 활성화할 수 있습니다. 예시에서 <shortcut>은 설정한 위챗 단축어로 바꾸세요.",
        note: "Plus 회원 전용",
        action: "Xiaowei 알아보고 시작하기",
      },
    ],
    scenes: {
      creative: {
        title: "AI 이미지 생성",
        chat: "위챗 대화",
        prompt: "@draw 도시 거리 인물 사진, 3:4",
        done: "이미지 생성 완료",
        resultLead: "당신의 아이디어가",
        resultAccent: "위챗에서 그림이 됩니다.",
        resultNote: "생성된 이미지는 대화로 바로 전송됩니다",
        roleplay: "역할극",
        roleplayNote: "캐릭터와 스토리 직접 설정",
      },
      modelsAria: "위챗에서 DeepSeek 사용: 모델 연결 가이드 보기",
      currentModel: "현재 모델",
      agentGuide: (name: string) => `${name} 연결 가이드`,
      wechat: "위챗",
      bridge: "작업 전송 · 결과 수신",
      cloud: {
        title: "Xiaowei",
        subtitle: "Wechatai 클라우드에서 실행되는 작업 어시스턴트",
        task: "Xiaowei에게 맡기기",
        done: "완료",
        prompt: "@<shortcut> 이 Markdown을 Word로 변환해 줘",
        fileName: "프로젝트_메모.docx",
        fileNote: "생성된 파일을 위챗으로 전송",
      },
    },
  },
} as const;
