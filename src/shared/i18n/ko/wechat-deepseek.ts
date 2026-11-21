import { DAILY_CREDIT_DEFAULTS } from "../../credits";
import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-deepseek",
  kind: "product",
  title: "위챗에서 DeepSeek 사용하는 방법: 연결 방식, 요금, 가이드",
  description:
    "위챗에서 DeepSeek을 사용하려면 ClawBot 진입 조건, API 키, 무료 한도와 모델 요금을 확인하세요. 스크린샷이 포함된 설정 가이드와 웹 검색, 음성, 무응답 문제 해결 방법도 정리했습니다.",
  eyebrow: "DeepSeek × 위챗",
  h1: "위챗에서 DeepSeek을 쓰고 싶다면 여기서 시작하세요",
  lede: "질문 하나를 위해 앱을 오갈 필요가 없습니다. 자신의 DeepSeek API를 위챗에 연결하면 일상 질문, 글쓰기, 정리를 채팅창에서 끝낼 수 있습니다. 먼저 연결 조건을 확인한 뒤 스크린샷을 따라 설정하세요.",
  answer:
    "위챗에서 DeepSeek을 사용하려면 API 키를 Wechatai에 설정해 일반 채팅을 맡기거나, 자신의 기기에서 OpenClaw를 실행해 위챗에 연결할 수 있습니다. 둘 다 DeepSeek API를 사용할 수 있으며 차이는 실행과 유지 관리를 누가 담당하느냐입니다. Wechatai의 위챗 연결도 ClawBot 플러그인으로 이루어지며 이 진입점을 우회할 수 없습니다.",
  primaryKeyword: "위챗에서 DeepSeek 사용",
  secondaryKeywords: [
    "위챗 deepseek 사용법",
    "위챗 deepseek 연결 가이드",
    "deepseek 위챗 봇",
    "위챗 deepseek api",
    "위챗 deepseek 무료",
    "deepseek 위챗 어시스턴트",
  ],
  highlights: ["일반 채팅에는 PC 상시 실행 불필요", "무료로 시작, 모델 요금 별도", "스크린샷 가이드와 문제 해결"],
  ctaLabel: "DeepSeek 위챗 가이드 보기",
  ctaHref: "/docs/deepseek-in-wechat",
  sections: [
    {
      id: "start-here",
      title: "가장 궁금한 네 가지 질문부터",
      body: `| 질문 | Wechatai로 연결할 때의 답 |
| --- | --- |
| 위챗에서 DeepSeek을 쓸 수 있나요? | Wechatai로 자신의 DeepSeek API를 위챗 ClawBot 1:1 대화에 연결할 수 있습니다. 먼저 계정에 해당 진입점이 있는지 확인하세요. |
| 앱을 설치하거나 PC를 계속 켜야 하나요? | 일반 모델 채팅은 Wechatai 서버에서 중계하므로 PC를 켜 둘 필요가 없습니다. 기기에서 에이전트를 실행하는 방식을 고를 때만 온라인 기기가 필요합니다. |
| 무료인가요? | Wechatai 무료 플랜은 매일 ${DAILY_CREDIT_DEFAULTS.free} 크레딧의 중계 한도를 제공합니다. DeepSeek API는 서비스 제공자가 별도로 청구하며 무료 모델 한도가 아닙니다. |
| 어디서 시작하나요? | 키가 있고 위챗에 진입점이 있다면 [스크린샷 설정 가이드](/docs/deepseek-in-wechat)를 바로 보세요. 진입점이 없다면 [ClawBot 확인 안내](/wechat-clawbot)를 먼저 보세요. |

Wechatai는 여러 모델을 연결하는 도구이며 DeepSeek은 그중 하나입니다. 연결한 뒤에도 Claude, GPT 또는 다른 호환 모델을 설정해 필요에 따라 전환할 수 있습니다. 모델마다 대화 맥락이 자동으로 공유되지는 않습니다.`,
    },
    {
      id: "three-paths",
      title: "관리형 채팅과 기기 내 에이전트 중 무엇을 고를까",
      body: `| 구분 | Wechatai 관리형 일반 채팅 | 기기 내 OpenClaw 연결 |
| --- | --- | --- |
| 자신의 기기를 계속 켜야 함 | 필요 없음 | 필요 |
| 에이전트 설치 | 필요 없음 | 필요 |
| 유지 관리 대상 | 채널 설정과 API 잔액 | 에이전트, 도구, 커넥터까지 유지 |
| 적합한 사용자 | 주로 위챗에서 대화하고 싶은 사용자 | 파일 읽기·쓰기, 도구 실행, 자동화 작업이 필요한 사용자 |

둘 다 DeepSeek API 키를 설정할 수 있습니다. **ClawBot은 위챗 쪽 통로**이며 Wechatai와 배타적인 별도 채팅 서비스가 아닙니다. Wechatai를 사용할 때도 위챗 ClawBot의 '스캔'으로 바인딩해야 합니다.

기기 내 OpenClaw를 고르면 자신의 기기가 계속 온라인 상태여야 합니다. Wechatai 관리형 일반 채팅은 모델 요청을 Wechatai 서버에서 전달하므로 PC를 켜 둘 필요가 없습니다. Wechatai를 통해 기기 내 OpenClaw를 연결해도 에이전트는 자신의 기기에서 실행됩니다.`,
    },
    {
      id: "key",
      title: "먼저 키를 발급받고 방식을 고르세요",
      body: `일반 채팅에는 유효한 API 키와 서비스 제공자 잔액이 필요합니다. 기기 내 에이전트는 온라인 기기와 실행 중인 에이전트도 필요합니다. 두 방식 모두 위챗 ClawBot 진입점이 사용 가능한지 먼저 확인해야 합니다.

Wechatai 관리형 채팅을 선택했다면 [DeepSeek 사용 가이드](/docs/deepseek-in-wechat)로 이동하세요. 필드별로 채널을 추가하고 모델을 확인한 뒤 연결을 테스트하고, 위챗을 바인딩해 첫 메시지를 보냅니다. 이 문서는 방식을 고르기 위한 안내이며, 단계별 조작과 오류 처리는 가이드에 있습니다.

[DeepSeek 공식 API 문서](https://api-docs.deepseek.com/zh-cn/)에서 주소, 모델, 가격을 확인하세요. 테스트 요청도 서비스 제공자 요금이 발생할 수 있습니다.`,
    },
    {
      id: "byok-or-platform",
      title: "DeepSeek은 자체 키가 유리한가요, 플랫폼 한도가 유리한가요",
      body: `자체 키를 쓰면 서비스 제공자 계정과 청구를 독립적으로 관리할 수 있습니다. 플랫폼 한도는 설정 단계를 줄일 수 있습니다. 총비용은 실제 모델, 입력·출력량, 캐시, 요금제, 한도 유효기간에 따라 달라지며 사용 빈도만으로 단정할 수 없습니다.

[비용 계산기](/pricing#estimate)로 Wechatai 크레딧과 직접 입력한 모델 단가를 각각 계산한 뒤, 다른 방식의 동일 사용량 견적과 비교해 보세요. 동일한 기준의 가격 데이터가 없으면 어느 쪽이 더 저렴하다고 약속하지 않습니다.`,
    },
    {
      id: "config",
      title: "설정 후 응답이 없을 때: DeepSeek에서 흔한 네 가지 문제",
      body: `| 증상 | 원인 | 처리 |
| --- | --- | --- |
| 401 / 인증 실패 | 키를 복사할 때 공백이 섞였거나 키가 삭제됨 | 키를 다시 만들고 앞뒤 공백이 없는지 확인하세요 |
| 모델이 존재하지 않음 | 모델 이름이 플랫폼 문서와 다름 | 서비스 제공자 문서와 모델 이름을 글자 단위로 대조하세요 |
| 잔액 부족 | 서비스 제공자 계정 잔액이 0 | 충전 후 다시 시도하세요. Wechatai 크레딧과는 별도 정산입니다 |
| 계속 응답 없음 | 프로토콜 선택 오류(OpenAI 호환 서비스에 Anthropic 프로토콜 사용) | OpenAI Chat Completions로 바꾼 뒤 다시 시도하세요 |

놓치기 쉬운 두 가지: **긴 글을 한 번에 너무 많이 보내면 입력 한도를 넘을 수 있으므로** 채널 설정에서 입력·출력 한도를 조정하세요. **첨부 파일은 Plus가 필요**하며 텍스트 질의응답에는 영향이 없습니다. 더 자세한 점검 순서는 [위챗 ClawBot 플러그인 사용법](/wechat-clawbot#no-reply)을 참고하세요.`,
    },
    {
      id: "usage",
      title: "위챗에 연결한 뒤 DeepSeek이 잘 맞는 작업",
      body: `DeepSeek을 기본 모델로 둘 때 가장 편한 몇 가지 상황입니다:

- **간단한 질의응답과 번역**: 위챗에서 바로 보내면 앱 전환이 필요 없습니다.
- **글쓰기와 다듬기**: 긴 문단을 넣어 고치는 편이 휴대폰에서 문장별로 고치는 것보다 빠릅니다.
- **붙여넣은 채팅 기록 정리**: 처리 권한이 있는 텍스트를 직접 붙여넣고 모델이 결론을 추리게 하세요. 이 사이트는 위챗 단체 대화에 접속하지 않으며 단체 메시지를 자동으로 읽지 않습니다.
- **DS Chat으로 웹 검색**: 자체 검색 API를 설정하면 모델이 필요에 따라 웹을 검색하거나 읽고 바로 답할 수도 있습니다. 플러그인에 들어갔다고 모든 답변이 웹 검증을 거치는 것은 아닙니다.
- **개인 비서와 함께**: 메모, 가계부, 할 일, 예약 알림 같은 구조화 작업에는 해당 플러그인을 설정하고 선택한 모델이 도구 호출을 지원하는지 확인하세요.

긴 문서를 통째로 읽거나 코드를 봐야 할 때는 먼저 \`/wx models\`로 현재 채널의 번호를 확인하고 \`/wx model 번호\`로 더 적합한 모델로 전환하세요. 채널을 넘을 때는 \`/wx channels\`를 보낸 뒤 \`/wx channel 번호\`로 채널을 전환합니다. 기존 기록은 보관되지만 각 모델은 자신의 활성 세션을 이어가며 맥락이 자동으로 공유되지 않으므로, 대상 세션에서 처리할 자료를 다시 제공하세요.`,
    },
  ],
  faq: [
    {
      question: "위챗에서 DeepSeek을 어떻게 사용하나요?",
      answer:
        "먼저 휴대폰 위챗에 ClawBot 진입점이 있는지 확인한 뒤, Wechatai에서 DeepSeek 채널을 추가하고 자신의 API 키를 입력해 모델을 테스트하세요. 이어서 QR 코드로 위챗을 연결하고 해당 1:1 대화에서 텍스트를 보냅니다. 전체 단계와 스크린샷은 이 사이트의 DeepSeek 사용 가이드에 있습니다.",
    },
    {
      question: "위챗에 ClawBot 진입점이 없으면 Wechatai로 연결할 수 없나요?",
      answer:
        "현재는 위챗 바인딩을 완료할 수 없습니다. Wechatai가 계정에 진입점을 열어 줄 수 없고 우회 방법도 제공하지 않습니다. 먼저 위챗 진입점 안내를 확인하고, 사용 가능한지 확인되기 전에는 결제하거나 API 키를 제출할 필요가 없습니다. 그동안 이 사이트의 스크린샷 DeepSeek 설정 가이드를 읽어 볼 수 있습니다.",
    },
    {
      question: "연결하면 DeepSeek 웹 버전처럼 웹 검색이 되나요?",
      answer:
        "일반 API 채팅은 웹 버전의 검색 기능을 자동으로 물려받지 않습니다. DS Chat의 답변 모델과 검색 서비스를 따로 설정할 수 있으며, 검색 실행 여부는 질문, 모델 판단, 인터페이스 가용성에 따라 달라집니다. 모델과 검색 요금은 별도입니다.",
    },
    {
      question: "위챗에서 DeepSeek을 쓰려면 PC를 계속 켜야 하나요?",
      answer:
        "연결 방식에 따라 다릅니다. 직접 구축한 OpenClaw는 상시 켜 둔 PC가 필요하고 종료하면 오프라인이 됩니다. 중계 서비스로 QR 코드를 바인딩하면 모델 호출이 클라우드에서 이루어져 PC가 온라인일 필요가 없습니다.",
    },
    {
      question: "DeepSeek API 키를 여러 곳에서 동시에 사용할 수 있나요?",
      answer:
        "네, 키 자체는 하나의 도구에서만 쓸 수 있도록 제한되지 않습니다. 다만 같은 키의 사용량이 합산 청구되고 문제가 생겼을 때 출처를 찾기 어려우므로 용도별로 나누어 만드는 편이 좋습니다.",
    },
    {
      question: "위챗의 DeepSeek과 웹 버전은 무엇이 다른가요?",
      answer:
        "위챗 연결은 직접 설정한 API 모델을 사용하며 DeepSeek 웹 버전의 계정, 멤버십, 대화 기록과 동기화되지 않습니다. 음성은 위챗의 음성 변환에 의존하고, 검색·이미지 생성·개인 비서는 각각 따로 설정해야 하며 웹 버전 기능을 자동으로 물려받지 않습니다.",
    },
    {
      question: "DeepSeek 연결에 비용이 드나요?",
      answer: `모델 호출은 DeepSeek 공식 요금표에 따라 계정 잔액에서 차감됩니다. Wechatai를 사용하면 메시지 텍스트량 기준 크레딧 비용이 추가됩니다. 무료 플랜은 매일 ${DAILY_CREDIT_DEFAULTS.free} 크레딧을 제공하며 실제 사용 가능한 대화 횟수는 입력, 출력, 대화 기록에 따라 달라집니다.`,
    },
    {
      question: "DeepSeek 추론 모델을 사용할 수 있나요?",
      answer:
        "네, 해당 모델이 OpenAI Chat Completions와 호환되는 인터페이스로 제공되면 사용할 수 있습니다. 추론 모델은 출력이 보통 더 길어 크레딧과 서비스 제공자 토큰을 더 많이 소모합니다.",
    },
  ],
  related: [
    { label: "위챗에서 DeepSeek 사용(문서 가이드)", href: "/docs/deepseek-in-wechat" },
    { label: "위챗 ClawBot이 지원하는 모델", href: "/wechat-clawbot-models" },
    { label: "위챗에서 Claude 사용", href: "/wechat-claude" },
    { label: "자체 API 키를 쓰는 위챗 AI", href: "/bring-your-own-api-key" },
    { label: "가격과 무료 한도", href: "/pricing" },
    { label: "채널과 모델 설정", href: "/docs/channels-models" },
  ],
  updatedAt: "2026-11-08",
};

export default [
  {
    path: "/wechat-deepseek",
    title: `${content.title} | Wechatai`,
    description: content.description,
    updatedAt: "2026-11-21",
    content,
  },
] satisfies readonly TranslationPage[];
