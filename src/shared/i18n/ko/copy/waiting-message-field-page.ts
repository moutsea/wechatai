import type { copy as source } from "../../zh-CN/copy/waiting-message-field-page";

export const copy: Record<keyof typeof source, string> = {
  发送等待提示: "대기 안내 보내기",
  "收到请求后，先在微信发送一条提示。提示不消耗 credits。":
    "요청을 받으면 먼저 WeChat으로 안내를 보냅니다. 안내에는 크레딧이 사용되지 않습니다.",
  "已关闭等待提示，完成后直接发送结果；出错时仍会告知原因。":
    "대기 안내를 껐습니다. 완료 후 결과를 바로 보내며 오류가 발생하면 사유를 안내합니다.",
  提示文案: "안내 문구",
  "最多 ": "최대 ",
  " 字，保存后生效。": "자, 저장 후 적용됩니다.",
  恢复默认文案: "기본 문구 복원",
};
