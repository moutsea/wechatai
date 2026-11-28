import { GROK_SETUP_MINUTES } from "../../../grok-bot";

export const routineInstructions =
  "Wechatai Webhook을 받으면 이번 Routine 실행을 위한 새 무작위 UUID를 claimId로 생성하고 Webhook의 taskId와 함께 wechatai_claim을 호출하세요. 응답을 받지 못하면 같은 claimId로 재시도하세요. claimed가 false이면 중단하고 true이면 한 번만 실행하세요. " +
  "text와 이번 history에 따라 요청을 처리하세요. 잘린 요구 사항에 의존하는 재시도는 먼저 사용자에게 확인하고 Grok의 승인 절차를 유지하세요. 이미지를 답변할 때는 수신한 imageUpload 안내에 따라 curl로 한 장씩 업로드하고 반환된 imageId를 기록하세요. " +
  "완료 후 수신한 receipt와 같은 taskId로 wechatai_finish를 호출하세요. 성공하면 completed를 제출하고 이미지가 있으면 images도 함께 제출하세요. 최종 텍스트는 가능한 한 maxOutputTokens 이내로 작성하세요. 완료할 수 없으면 failed를 제출하고 text를 비워 두세요. 네트워크가 끊기면 같은 결과 전송만 재시도하세요. 도구가 시간 초과 또는 정산 완료를 알리면 전송을 중단하고 원래 작업을 다시 실행하지 마세요.";

// Connector and Routine identifiers match existing configurations in every locale.
export function setupPrompt(input: { endpoint: string; token: string; shortcut: string }) {
  return [
    "WeChat에서 텍스트 작업을 보내고 텍스트와 이미지 응답을 받을 수 있도록 Wechatai (wechatai.app)에 연결해 주세요. 다음 순서로 진행하세요.",
    "",
    `1. 이름이 ‘微伴’인 원격 MCP 서버 (Remote HTTPS)를 설정하세요. URL은 ${input.endpoint}, 요청 헤더는 Authorization: Bearer ${input.token}입니다. 같은 이름의 커넥터가 있으면 URL과 헤더만 변경하세요.`,
    "2. 이름이 ‘微伴微信任务’인 Routine을 설정하세요. Webhook으로만 실행하며 예약이나 다른 트리거를 추가하지 마세요. 같은 이름의 Routine이 있으면 해당 지침을 업데이트하고 기존 항목을 사용하세요. Routine 지침은 다음과 같습니다.",
    routineInstructions,
    `3. Routine의 Webhook POST URL과 key를 읽고 ‘微伴’의 wechatai_register_webhook 도구로 제출하세요. key에는 Bearer 접두사를 포함하지 마세요. ${GROK_SETUP_MINUTES}분 안에 완료하고 도구가 성공하면 다시 호출하지 마세요.`,
    `4. 성공하면 설정 완료를 알려 주세요. WeChat에서 @${input.shortcut} 뒤에 작업을 적어 테스트하겠습니다. Webhook URL이나 key를 읽을 수 없으면 데스크톱에서 복사할 위치를 알려 주세요. Wechatai에 직접 입력하겠습니다.`,
    "",
    "이 지침에는 Wechatai 연결 인증 정보가 포함되어 있습니다. 이번 설정에만 사용하고 다른 사람에게 보내거나 공개 위치에 저장하지 마세요.",
  ].join("\n");
}

export function reopenPrompt(input: { shortcut: string }) {
  return [
    `Wechatai Webhook 등록이 다시 열렸으며 ${GROK_SETUP_MINUTES}분 동안 유효합니다. 연결을 완료해 주세요.`,
    "",
    "1. ‘微伴’ MCP 커넥터와 ‘微伴微信任务’ Routine이 있는지 확인하세요. 없는 항목만 이전 설정 지침에 따라 추가하세요.",
    "2. ‘微伴微信任务’의 Webhook POST URL과 key를 읽고 ‘微伴’의 wechatai_register_webhook 도구로 제출하세요. key에는 Bearer 접두사를 포함하지 마세요.",
    `3. 성공하면 설정 완료를 알려 주세요. WeChat에서 @${input.shortcut} 뒤에 작업을 적어 테스트하겠습니다.`,
  ].join("\n");
}
