import type { copy as source } from "../../zh-CN/copy/model-endpoint-preview-page";

export const copy: Record<keyof typeof source, string> = {
  实际请求地址: "실제 요청 주소",
  "请输入有效的 HTTP(S) 服务地址，不要包含密钥、查询参数或 # 片段。":
    "유효한 HTTP(S) 서비스 주소를 입력하세요. 키, 쿼리 매개변수 또는 # 조각을 포함하지 마세요.",
  "填写 Base URL 后显示。": "Base URL 입력 후 표시됩니다.",
};
