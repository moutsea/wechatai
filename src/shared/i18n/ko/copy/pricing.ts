/**
 * Korean copy for the pricing page, shared by the rendered page and JSON-LD.
 * Amounts, daily allowances, refund/renewal terms and plan limits still come
 * from the existing billing, credit, link and plugin modules.
 */
import { BILLING_OFFERS } from "../../../billing-offers";
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { approxYuan } from "../../../pricing-copy";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const monthly = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly")!;
const yearly = BILLING_OFFERS.find((offer) => offer.id === "plus_yearly")!;
const monthlyPrice = `월 ¥${monthly.amount / 100}`;
const yearlyPrice = `연 ¥${yearly.amount / 100}`;

const packs = BILLING_OFFERS.filter((offer) => offer.kind === "credits")
  .map((offer) => `¥${offer.amount / 100}에 ${offer.credits} 크레딧`)
  .join(", ");

export const pricingCopy = {
  seo: {
    title: `가격: 매일 무료 ${DAILY_CREDIT_DEFAULTS.free} 크레딧, Plus ${monthlyPrice}`,
    description: `Wechatai 무료 플랜과 Plus를 비교하세요: 일일 크레딧, 위챗 연결, 플러그인, 첨부 파일, Xiaowei AI. 무료 플랜은 매일 ${DAILY_CREDIT_DEFAULTS.free} 크레딧을 제공하며 Plus는 ${monthlyPrice} 또는 ${yearlyPrice}로 1회 구매하고 자동 갱신되지 않습니다. 모델 API 요금은 별도입니다.`,
    eyebrow: "가격 및 플랜",
    h1: "무료로 시작하고 필요할 때 Plus로 업그레이드하세요",
    lede: "무료 플랜으로 일상적인 질문을 해결하세요. Plus는 더 많은 크레딧과 Xiaowei AI를 제공합니다. 모델 API 키는 직접 준비하며 모델 요금은 서비스 제공자가 별도로 청구합니다.",
    answer:
      "무료 플랜으로 일상적인 질문을 해결하세요. Plus는 더 많은 크레딧과 Xiaowei AI를 제공합니다. 모델 API 키는 직접 준비하며 모델 요금은 서비스 제공자가 별도로 청구합니다.",
    primaryKeyword: "위챗 AI 가격",
    secondaryKeywords: [
      "Wechatai 가격",
      "위챗 AI 비용",
      "위챗 AI 무료 크레딧",
      "ClawBot 요금",
    ],
    faq: [
      {
        question: "멤버십 요금에 모델 비용이 포함되나요?",
        answer:
          "아니요. 멤버십과 크레딧은 Wechatai의 플랫폼 서비스에 사용됩니다. 일반 채팅, 이미지 생성, Xiaowei는 직접 설정한 모델 API를 사용하며 모델 요금은 서비스 제공자가 별도로 청구합니다. 기존 Muse, Hermes, OpenClaw 설정은 각자의 모델과 요금 설정을 유지합니다.",
        guide: { label: "모델 설정 알아보기", href: "/docs/channels-models" },
      },
      {
        question: "크레딧은 어떻게 사용하며 일일 크레딧이 이월되나요?",
        answer: `크레딧은 플랫폼 사용량입니다. 텍스트는 입력, 출력, 대화 기록에 따라 차감됩니다. 예를 들어 한 요청에서 입력 1,000 토큰과 출력 1,000 토큰을 사용하면 약 1.8 크레딧이 차감됩니다. 이미지 생성은 장당 5 크레딧이 추가되고 설명 텍스트는 별도로 계산됩니다. 무료 플랜은 매일 ${DAILY_CREDIT_DEFAULTS.free}, Plus는 매일 ${DAILY_CREDIT_DEFAULTS.plus} 크레딧을 제공하며 당일만 유효하고 이월되지 않습니다. Webhook 서비스 알림은 크레딧을 차감하지 않습니다.`,
        guide: { label: "전체 과금 규칙 보기", href: "/docs/credits" },
      },
      {
        question: "크레딧이 부족하면 어떻게 하나요?",
        answer: `다음 날 일일 크레딧이 초기화되기를 기다리거나 충전 패키지를 구매하세요: ${packs}. 충전에는 Plus가 필요하지 않으며 구매한 크레딧은 계속 유효합니다. 충전 패키지를 구매해도 Plus 전용 기능이 열리지는 않습니다.`,
        guide: { label: "멤버십과 크레딧으로 이동", href: "/app/billing" },
      },
      {
        question: "Plus의 Xiaowei AI는 무엇을 할 수 있나요?",
        answer:
          "Xiaowei는 Wechatai 클라우드에서 실행되는 어시스턴트로, 파일을 처리하고 문서를 생성하며 작업을 수행한 뒤 결과를 위챗으로 보냅니다. 설치나 배포는 필요 없습니다. 서비스가 열리면 Plus 회원은 자신의 텍스트 모델을 설정한 뒤 플러그인 페이지에서 Xiaowei를 직접 활성화할 수 있습니다. 작업 횟수, 저장 한도, 서비스 상태는 플러그인 페이지에서 확인할 수 있고 모델 API 요금은 별도로 청구됩니다.",
        guide: { label: "Xiaowei와 사용 조건 알아보기", href: "/docs/cloud-agent" },
      },
      {
        question: "Plus는 얼마이며 자동 갱신되나요?",
        answer: `Plus는 ${monthlyPrice} 또는 ${yearlyPrice}(월 약 ${approxYuan(yearly.amount / 12)})입니다. 새 멤버십은 1회 결제로 자동 갱신되지 않으며 미리 갱신하면 기간이 연장됩니다. 멤버십이 만료되면 무료 플랜으로 돌아가고 구매한 크레딧은 유지됩니다. 기존 자동 갱신 구독은 "구독 관리"에서 해지할 수 있습니다.`,
      },
      {
        question: "구매 후 환불할 수 있나요?",
        answer:
          "환불을 원하시면 주문 정보와 함께 문의해 주세요. 실제 주문, 사용 내역, 관련 법률에 따라 처리하며 구체적인 기준은 서비스 약관을 따릅니다.",
        guide: { label: "고객 지원 문의", href: "/contact" },
      },
      {
        question: "시작 전에 무엇을 준비해야 하나요?",
        answer:
          "먼저 휴대폰 위챗에 ClawBot 메뉴가 있는지 확인하세요. Wechatai가 계정에 이 메뉴를 열어 줄 수는 없습니다. 일반 채팅과 Xiaowei에는 모델 API 키가 필요하고 이미지 생성에는 이미지 모델과 플러그인이 필요합니다. 휴대폰으로 스캔할 때는 컴퓨터나 다른 기기에서 QR 코드를 표시하세요.",
        guide: { label: "시작 가이드 보기", href: "/docs/getting-started" },
      },
    ],
    related: [{ label: "위챗용 Muse 관리형 어시스턴트", href: "/wechat-muse" }],
  },
  page: {
    skip: "본문으로 건너뛰기",
    breadcrumbLabel: "이동 경로",
    home: "홈",
    breadcrumbCurrent: "가격 및 플랜",
    faqTitle: "더 궁금한 점이 있나요?",
    estimatorSummary: "하루 사용량 예측하기",
    help: "도움이 필요하면 문의하세요",
    terms: "서비스 약관",
  },
  plans: {
    title: "무료와 Plus 비교",
    free: {
      name: "무료",
      badge: "간편 시작",
      description: "일상적인 질문부터 시작",
      unit: "영구 무료",
      note: "멤버십 없이 바로 시작할 수 있습니다",
      workspace: "워크스페이스 열기",
      start: "무료로 시작",
    },
    badgeFlexible: "유연한 선택",
    badgeSave: (saving: string) => `${saving} 절약`,
    descriptionAnnual: "장기 사용에 유리한 연간 플랜",
    descriptionMonthly: "더 많은 크레딧과 Xiaowei AI",
    unitYear: "/ 년",
    unitMonth: "/ 월",
    noteAnnual: (approx: string, saving: string) =>
      `월 약 ${approx}, 월간 대비 ${saving} 절약`,
    noteMonthly: "1개월 단위로 구매하며 필요할 때 갱신합니다.",
    ctaBusy: "결제 페이지로 이동 중…",
    ctaSubscribe: (name: string, price: string) => `${name} 시작 · ${price}`,
    ctaChoose: (name: string) => `${name} 선택`,
    loginAgain: "다시 로그인",
    checkoutFailed: "결제를 시작하지 못했습니다. 다시 시도해 주세요.",
    checkoutErrors: {
      unauthorized: "세션이 만료되었습니다. 계속하려면 다시 로그인하세요.",
      rate_limited: "시도가 너무 많습니다. 잠시 후 다시 시도하세요.",
      billing_unavailable: "현재 이 플랜을 구매할 수 없습니다. 나중에 다시 시도하세요.",
      already_subscribed:
        "이미 정기 결제 또는 처리 중인 구독이 있습니다. 일회성 멤버십을 구매하기 전에 구독 관리에서 자동 갱신을 끄세요. 남은 기간은 유지됩니다.",
      payment_processing: "결제를 확인하고 있습니다. 잠시 후 새로고침하세요.",
      checkout_in_progress: "이미 주문을 생성 중입니다. 잠시 후 다시 시도하세요.",
    },
    offerName: (interval: "month" | "year") =>
      interval === "year" ? "Plus 연간" : "Plus 월간",
    features: [
      {
        label: "일일 크레딧",
        free: DAILY_CREDIT_DEFAULTS.free,
        plus: DAILY_CREDIT_DEFAULTS.plus,
      },
      {
        label: "위챗 연결",
        free: WECHAT_LINK_LIMITS.free,
        plus: WECHAT_LINK_LIMITS.plus,
      },
      { label: "플러그인 설정", free: PLUGIN_LIMITS.free, plus: "무제한" },
      { label: "이미지 및 파일 입력", free: false, plus: true },
      { label: "웹에서 채팅 기록 보기", free: false, plus: true },
      {
        label: "Xiaowei AI 클라우드 어시스턴트",
        free: false,
        plus: true,
        href: "/docs/cloud-agent",
      },
    ],
    highlights: ["일일 크레딧", "위챗 연결", "플러그인 설정"],
    supported: "지원",
    unsupported: "미지원",
    comparisonCaption: "혜택 비교 · Plus 월간과 연간의 혜택은 같습니다",
    comparisonHeaders: ["기능 및 한도", "무료", "Plus"],
    common:
      "모든 플랜에서 모델 채팅, AI 이미지 생성, 역할극, 무료 서비스 알림을 이용할 수 있습니다.",
    fineprint:
      "Plus는 1회 구매이며 자동 갱신되지 않습니다. 월간과 연간의 혜택은 같습니다. 일일 크레딧은 당일만 유효하며 이월되지 않습니다.",
    checked: "가격 확인일",
  },
  estimator: {
    eyebrow: "자체 API 사용 시 두 가지 비용",
    title: "먼저 텍스트 사용량을 예측하세요",
    intro:
      "브라우저에서만 계산하며 로그인이 필요 없습니다. 제공자 단가는 모델 API 비용을 예측하는 값입니다. Xiaowei도 직접 설정한 모델을 사용하며 여러 번 호출할 수 있으므로 실제 API 요금은 제공자 청구서를 따릅니다. 클라우드 서비스에는 Plus와 서비스 제공 여부가 필요하며 실행 횟수에 별도 한도가 있습니다.",
    fields: [
      "턴당 입력 토큰(대화 기록 포함)",
      "턴당 출력 토큰",
      "하루 요청 턴 수",
      "제공자 입력 단가(위안 / 백만 토큰)",
      "제공자 출력 단가(위안 / 백만 토큰)",
    ],
    placeholder: "선택 입력, 위안 단가",
    creditsUnit: "크레딧",
    platformLabel: "Wechatai 사용량 / 일",
    platformHint: (free: number, plus: number) =>
      `무료는 매일 ${free}, Plus는 매일 ${plus}입니다. 일일 크레딧은 이월되지 않습니다.`,
    providerLabel: "제공자 모델 비용 / 일",
    providerValue: (amount: string) => `약 ¥${amount}`,
    providerEmpty: "단가를 입력하면 표시됩니다",
    providerHint:
      "모델 API 요금은 서비스 제공자에게 별도로 지불하며 Xiaowei의 내부 호출에도 API 요금이 발생할 수 있습니다.",
    invalid: "0 이상의 올바른 숫자를 입력하세요. 토큰과 턴 수는 정수여야 합니다.",
    note:
      "계산식: (입력 + 출력 × 8) ÷ 5,000, 턴마다 0.001 크레딧 단위로 올림합니다. 입력에는 매 턴 실제 전송되는 대화 기록이 포함되어야 합니다. 캐시 차이, 검색, 추가 도구 호출, 첨부 파일, 이미지 생성, 세금, 환율은 포함하지 않습니다. 견적이 아니며 고정된 채팅 횟수를 보장하지 않습니다.",
    noteLink: "전체 과금 규칙 보기",
  },
  relatedHeading: "계속 알아보기",
} as const;
