import { GROK_WAITING_MESSAGE } from "../../../grok-bot";
import { OPENCLAW_WAITING_MESSAGE, IMAGE_WAITING_MESSAGE } from "../../../waiting-message";
import { CLOUD_AGENT_WAITING_MESSAGE } from "../../../cloud-agent";
import { GROK_DISPATCH_UNAVAILABLE } from "../../../grok-bot";
import { IMAGE_CREDITS } from "../../../credits";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import {
  OWN_API_COST_NOTE,
  IMAGE_CREDIT_COST_NOTE,
  CLOUD_AGENT_COST_NOTE,
} from "../../../pricing-copy";
import { CLOUD_AGENT_FILE_LIMITS_NOTE } from "../../../cloud-agent";
import { PLUGIN_SHORTCUT_HINT, LEGACY_NUMERIC_SHORTCUT_HINT } from "../../../plugin-shortcut";

export const workspaceLabels: Record<string, string> = {
  "Plus 月付": "Plus 월간 결제",
  "Plus 年付": "Plus 연간 결제",
  "DeepSeek 原生搜索": "DeepSeek 네이티브 검색",
  "https://你的搜索服务/search": "https://search.example.com/search",
  "会员到期或插件超出名额时，连接状态和日志明确说明暂停原因及恢复方式。":
    "멤버십이 만료되거나 플러그인 한도를 초과하면 연결 상태와 로그에 일시 중지 사유 및 복구 방법을 표시합니다.",
  "保留原有绑定，权益恢复后自动重试连接。":
    "기존 연결 정보를 보관하고 이용 권한이 복구되면 자동으로 연결을 재시도합니다.",
  "正则或无关键词的非常驻条目已停用，请手动设置关键词后启用。":
    "정규식 항목 또는 키워드가 없는 비상시 항목은 비활성화했습니다. 키워드를 직접 설정한 뒤 활성화하세요.",
  "世界书按关键词、常驻开关和优先级运行；不支持递归触发、正则、概率、脚本或自定义插入位置。":
    "세계관 설정집은 키워드, 상시 적용 여부 및 우선순위에 따라 작동합니다. 재귀 트리거, 정규식, 확률, 스크립트 또는 사용자 지정 삽입 위치는 지원하지 않습니다.",
  "只替换 {{char}} 和 {{user}}；其他宏保留为普通文字，不执行。":
    "{{char}}와 {{user}}만 치환합니다. 다른 매크로는 일반 텍스트로 보관하며 실행하지 않습니다.",
  "仅导入文字设定，PNG 封面不保存。备用开场白与其他扩展仅保留在原始 JSON 中，不会执行或自动加载。":
    "텍스트 설정만 가져오며 PNG 표지는 저장하지 않습니다. 추가 첫인사와 기타 확장은 원본 JSON에만 보관되며 실행하거나 자동으로 불러오지 않습니다.",
  [GROK_WAITING_MESSAGE]: "Grok Bot에 작업을 전달했습니다. 답변을 기다리고 있습니다…",
  [OPENCLAW_WAITING_MESSAGE]: "전달했습니다. 답변을 기다리고 있습니다…",
  [IMAGE_WAITING_MESSAGE]: "이미지 생성을 요청했습니다. 결과를 기다리고 있습니다…",
  [CLOUD_AGENT_WAITING_MESSAGE]:
    "작업을 접수해 Xiaowei에 제출하고 있습니다. 결과는 WeChat으로 답변하며 클라우드 작업 페이지에서도 확인할 수 있습니다.",
  个人助理: "개인 도우미",
  每日赠送: "일일 무료 지급",
  每日赠送补足: "일일 무료 크레딧 보충",
  请求额度预留: "요청 크레딧 예약",
  "未完成请求，释放预留额度": "요청 미완료로 예약 크레딧 반환",
  每日赠送额度到期: "일일 무료 크레딧 만료",
  会员周期额度到期: "멤버십 기간 크레딧 만료",

  提交注册: "가입 제출",
  注册信已自动发出: "가입 이메일 자동 발송",
  邮箱已验证: "이메일 인증 완료",
  引导完成: "시작 안내 완료",
  渠道配置已保存: "채널 설정 저장",
  渠道模型已导入: "채널 모델 가져오기 완료",
  微信已连接: "WeChat 연결 완료",
  看到付费墙: "업그레이드 안내 조회",
  点了升级: "업그레이드 클릭",
  发起结账: "결제 시작",
  结账成功: "결제 완료",
  拉模型失败: "모델 가져오기 실패",
  跳过引导: "시작 안내 건너뜀",
  复制邀请链接: "초대 링크 복사",
  "首屏 CTA 点击": "첫 화면 버튼 클릭",
  到达注册页: "가입 페이지 방문",
  快捷登录点击: "간편 로그인 클릭",
  "手动发送/重发验证信": "인증 이메일 수동 발송/재발송",
  "（未知）": "(알 수 없음)",
  "（直接访问）": "(직접 방문)",

  [GROK_DISPATCH_UNAVAILABLE]: "Grok Bot 작업 전달 서비스를 아직 이용할 수 없습니다.",
  小薇: "Xiaowei",
  文本模型: "텍스트 모델",
  生图模型: "이미지 생성 모델",
  其他模型: "기타 모델",
  待首次微信对话: "첫 WeChat 대화 대기",
  奖励发放中: "보상 지급 중",
  奖励已到账: "보상 지급 완료",
  不符合奖励条件: "보상 조건에 해당하지 않음",
  "Kimi（月之暗面）": "Kimi (Moonshot AI)",
  "智谱 GLM": "Zhipu GLM",
  "通义千问（阿里云百炼）": "Qwen (Alibaba Cloud Bailian)",
  "豆包（火山方舟）": "Doubao (Volcengine Ark)",
  硅基流动: "SiliconFlow",
  "智谱 Coding Plan": "Zhipu Coding Plan",
  "百炼 Coding Plan": "Bailian Coding Plan",
  "火山方舟 Coding Plan": "Volcengine Ark Coding Plan",
  "默认使用华北 2（北京）地域；其他地域或专属空间地址请选择「自定义」。":
    "기본 지역은 중국 북부 2 (베이징)입니다. 다른 지역 또는 전용 공간 주소는 사용자 지정을 선택하세요.",
  自定义: "사용자 지정",
  待连接: "연결 대기",
  等待上线: "온라인 대기",
  已连接: "연결됨",
  已离线: "오프라인",
  已暂停: "일시 중지됨",
  已配置: "설정됨",
  待配置: "설정 대기",
  "等待 Bot 完成配置": "Bot 설정 완료 대기",
  "待 Bot 连接": "Bot 연결 대기",
  会员到期已暂停: "멤버십 만료로 일시 중지됨",
  "配置已保存，请执行连接命令完成连接": "설정을 저장했습니다. 연결 명령을 실행해 연결을 완료하세요",
  "配对已完成，等待 Agent 连接器上线":
    "연결 정보를 등록했습니다. 에이전트 커넥터의 온라인 전환을 기다립니다",
  "Agent 连接器在线，可以在微信中使用":
    "에이전트 커넥터가 온라인입니다. WeChat에서 사용할 수 있습니다",
  "Agent 连接器离线，请检查 Gateway 或托管环境中的 hook 是否运行":
    "에이전트 커넥터가 오프라인입니다. Gateway 또는 호스팅 환경의 hook이 실행 중인지 확인하세요",
  "此配置已暂停，请查看会员与插件设置":
    "이 설정이 일시 중지되었습니다. 멤버십과 플러그인 설정을 확인하세요",
  "在微信发送 @快捷名 加文字验证收发；Webhook 按消息触发。":
    "WeChat에서 @바로가기와 텍스트를 보내 송수신을 확인하세요. Webhook은 메시지마다 실행됩니다.",
  "把配置指令发给 Grok Bot，由它添加连接器、创建 Routine 并登记 Webhook。":
    "설정 명령을 Grok Bot에 보내 커넥터 추가, Routine 생성 및 Webhook 등록을 진행하세요.",
  "Grok Bot 还没用当前凭据连上微伴。请让它按配置指令完成连接，或在配置中重新开放登记。":
    "Grok Bot이 현재 인증 정보로 Wechatai에 연결하지 않았습니다. 설정 명령에 따라 연결하거나 설정에서 등록을 다시 여세요.",
  "生成配置指令并发给你的 Grok Bot，由它完成连接。":
    "설정 명령을 생성해 내 Grok Bot에 보내 연결을 완료하세요.",
  版本待检测: "버전 확인 대기",
  有更新: "업데이트 있음",
  等待上线确认: "온라인 확인 대기",
  运行版本高于本站版本: "실행 버전이 사이트 제공 버전보다 최신입니다",
  已是最新版本: "최신 버전입니다",
  "LLM 对话": "LLM 대화",
  "AI 生图": "AI 이미지 생성",
  角色扮演: "역할극",
  "历史 / 未分类调用": "이전 / 미분류 호출",
  直接访问: "직접 방문",
  未知来源: "출처 미확인",
  [OWN_API_COST_NOTE]:
    "직접 설정한 모델, 검색 또는 이미지 생성 API 비용은 제공업체에 별도로 지불하며 Wechatai 멤버십이나 크레딧에 포함되지 않습니다.",
  [IMAGE_CREDIT_COST_NOTE]: `AI 이미지 생성과 Xiaowei가 반환한 이미지는 장당 ${IMAGE_CREDITS} 크레딧이며 프롬프트와 답변 텍스트는 별도로 계산합니다. 이미지 업로드, 미리보기 및 재전송에는 결과 이미지 요금을 부과하지 않습니다. 모델 API 비용은 제공업체가 별도로 청구합니다.`,
  [CLOUD_AGENT_COST_NOTE]: `Xiaowei는 운영자가 서비스를 활성화한 후 Plus 회원이 사용할 수 있으며 Wechatai에 설정한 텍스트 모델을 사용합니다. 모델 API 비용은 제공업체에 별도로 지불합니다. 플랫폼은 작업 입력과 최종 답변 텍스트를 기준으로 크레딧을 계산하며 이미지는 장당 ${IMAGE_CREDITS} 크레딧이 추가되고 그 외 파일은 추가 과금하지 않습니다. 실행 횟수는 별도로 제한됩니다.`,
  [CLOUD_AGENT_FILE_LIMITS_NOTE]:
    "전체 저장 공간과 1회 처리 한도는 다릅니다. 작업 공간 파일은 최대 25 MiB입니다. 변환 도구가 한 번에 읽거나 생성하는 작업 파일은 각각 최대 2 MiB이며 입력과 출력 합계는 각각 최대 8 MiB입니다.",
  [PLUGIN_SHORTCUT_HINT]:
    "별칭은 1~24자이며 문자, 숫자, 밑줄 또는 하이픈을 사용할 수 있습니다. 숫자로만 구성할 수 없습니다",
  [LEGACY_NUMERIC_SHORTCUT_HINT]:
    "기존 숫자 전용 별칭을 유지하면서 다른 설정을 저장할 수 있습니다. /use 사용 전에는 문자가 포함된 별칭으로 변경하세요.",
  "此 OpenAI 模型仅支持 OpenAI Chat Completions。请在渠道的「自定义接口」中切换协议，或新建对应协议的渠道后添加模型。":
    "이 OpenAI 모델은 Chat Completions만 지원합니다. 채널의 사용자 지정 API에서 프로토콜을 변경하거나 해당 프로토콜의 채널을 만들고 모델을 추가하세요.",
  "此 OpenAI 模型仅支持 OpenAI Responses。请在渠道的「自定义接口」中切换协议，或新建对应协议的渠道后添加模型。":
    "이 OpenAI 모델은 Responses만 지원합니다. 채널의 사용자 지정 API에서 프로토콜을 변경하거나 해당 프로토콜의 채널을 만들고 모델을 추가하세요.",
};

export const workspaceErrors: Record<string, string> = {
  request_failed: "요청을 완료하지 못했습니다. 설정과 연결을 확인한 뒤 다시 시도하세요.",
  unauthorized: "로그인 세션이 만료되었습니다. 다시 로그인하세요.",
  forbidden: "이 작업을 수행할 권한이 없습니다.",
  not_found: "요청한 항목을 찾을 수 없습니다. 새로고침한 뒤 다시 확인하세요.",
  invalid_input: "입력 내용을 확인한 뒤 다시 저장하세요.",
  channel_limit:
    "현재 플랜의 채널 수 한도에 도달했습니다. 사용하지 않는 채널을 삭제하거나 플랜을 확인하세요.",
  connection_limit:
    "현재 플랜의 WeChat 연결 수 한도에 도달했습니다. 사용하지 않는 연결을 삭제하거나 플랜을 확인하세요.",
  plugin_limit: `Free는 플러그인을 최대 ${PLUGIN_LIMITS.free}개 설정할 수 있습니다. 사용하지 않는 설정을 삭제하거나 Plus를 갱신하세요. 비활성화만 하면 자리가 확보되지 않습니다.`,
  membership_expired:
    "Plus 멤버십 만료로 이 설정이 일시 중지되었습니다. 멤버십을 갱신하거나 사용하지 않는 설정을 삭제하세요.",
  plus_required: "이 기능에는 Plus가 필요합니다. 멤버십을 확인하거나 갱신하세요.",
  cloud_plus_required:
    "Xiaowei는 Plus 전용 기능입니다. 가입 또는 갱신 후 새 작업을 요청하세요. 기존 작업 기록은 볼 수 있습니다.",
  cloud_agent_unavailable:
    "클라우드 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.",
  cloud_agent_admin_only: "Xiaowei는 현재 관리자 시험 운영 중입니다.",
  cloud_model_required:
    "Xiaowei에는 텍스트 모델이 필요합니다. 채널 및 모델을 설정하세요. 별도로 지정하지 않으면 현재 WeChat의 기본 텍스트 모델을 사용합니다.",
  plugin_disabled: "플러그인이 비활성화되어 있습니다. 플러그인 설정에서 활성화하세요.",
  connection_paused: "수신 WeChat이 일시 중지되었습니다. 다른 연결을 선택하거나 Plus를 갱신하세요.",
  wechat_not_connected: "먼저 WeChat 연결에서 QR 코드를 스캔한 뒤 해당 대화로 /wx help를 보내세요.",
  wechat_context_required:
    "해당 WeChat 대화로 /wx help를 보내 응답 경로를 만든 뒤 알림을 테스트하세요. 이 명령은 크레딧을 사용하지 않습니다.",
  wechat_reply_window_expired:
    "수신 WeChat에서 24시간 넘게 대화하지 않았습니다. /wx help를 보내 응답 가능 시간을 갱신한 뒤 알림을 테스트하세요. 다시 스캔할 필요는 없습니다.",
  wechat_channel_required:
    "일반 대화에는 채널과 텍스트 모델이 필요합니다. 채널 및 모델에서 API 키와 서비스 URL을 입력하고 모델을 추가하세요.",
  wechat_channel_incomplete: "채널 설정의 API 키와 서비스 URL을 완성한 뒤 일반 대화를 시작하세요.",
  wechat_model_required:
    "채널 프로토콜과 호환되는 텍스트 모델을 추가하세요. 채널이나 이미지 모델만으로는 일반 대화를 할 수 없습니다.",
  legacy_unknown: "이전 실패 기록, 구체적인 사유 없음",
  kimiseek_insufficient_balance: "KimiSeek 잔액 부족",
  upstream_payment_required: "모델 제공업체 잔액 부족 또는 결제 필요",
  model_http_error: "모델 서비스 요청 실패",
  image_upstream: "이미지 생성 서비스 요청 실패",
  remote_agent_failed: "원격 에이전트 작업 미완료",
  request_timeout: "요청 시간 초과",
  image_timeout: "이미지 생성 시간 초과",
  empty_reply: "모델 응답 내용 없음",
  model_failed: "모델 요청 미완료",
  tool_call_incomplete: "모델 도구 호출이 잘렸습니다",
  tool_call_invalid: "유효하지 않은 모델 도구 호출",
  plugin_empty_result: "플러그인 결과 없음",
  empty_result: "모델 또는 플러그인 응답 없음",
  context_limit: "모델 맥락 한도 초과",
  message_too_long: "입력 한도 초과",
  invalid_context_window: "모델 입력 및 출력 설정 충돌",
  budget_too_small: "요청당 크레딧 한도 부족",
  image_download: "생성 이미지 다운로드 실패",
  image_response: "이미지 생성 응답 형식 오류",
  image_size: "생성 이미지 크기 한도 초과",
  unsafe_url: "허용되지 않는 모델 서비스 URL",
  model_redirect: "모델 서비스 URL 리디렉션 발생",
  context_changed: "처리 중 대화가 변경되었습니다",
  insufficient_credits: "Wechatai 크레딧 부족",
  search_failed: "검색 서비스 요청 실패",
  interrupted_request: "처리 프로세스 중단",
  personal_recovery_expired: "도우미 작업 복구 시간 초과",
  personal_recovery_changed: "복구 중 설정 또는 대화 변경",
  personal_recovery_missing: "작업 복구 진행 정보 불완전",
};

export const modelImportCopy = {
  imported: "모델 {count}개를 가져왔습니다",
  noNew: "가져올 새 모델이 없습니다",
  empty: "제공업체가 가져올 모델을 반환하지 않았습니다. 직접 추가하세요",
  existing: "기존 모델 {count}개",
  invalid: "유효하지 않은 항목 {count}개 건너뜀",
  incompatible:
    "현재 프로토콜과 호환되지 않는 모델 {count}개 건너뜀. 채널 프로토콜을 변경한 후 다시 가져올 수 있습니다",
  limited: "채널당 최대 {limit}개 모델이며 {count}개는 가져오지 못했습니다",
};

export const balanceCopy = {
  unavailable: "잔액을 조회할 수 없습니다",
  title: "KimiSeek 잔액",
  loading: "조회 중…",
  refresh: "KimiSeek 잔액 새로고침",
  updated: "최근 업데이트 {time}",
  recharge: "충전",
};

export const ledgerCopy = {
  usage: "실제 사용량 {amount} 크레딧",
  summary: "대화 맥락 정리 {amount} 크레딧",
  repaid: " · 미납 차감 {amount} 크레딧",
  inviter: "친구 초대 보상 · 영구 유효",
  invitee: "초대 가입 보상 · 영구 유효",
  purchase: "크레딧 충전",
};
