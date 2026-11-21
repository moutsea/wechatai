import { IMAGE_CREDITS } from "../../../credits";

/** Korean wording for the two cost boundaries shared by landing pages. */
export const OWN_API_COST_NOTE =
  "자체 모델, 검색 또는 이미지 API를 사용할 때 요금은 서비스 제공자에게 별도로 지불하며 Wechatai 멤버십이나 크레딧에 포함되지 않습니다.";

export const CLOUD_AGENT_COST_NOTE = `Xiaowei는 운영자가 기능을 활성화한 뒤 Plus 회원이 사용할 수 있으며, Wechatai에 설정한 텍스트 모델을 사용합니다. 모델 API 요금은 서비스 제공자에게 별도로 지불합니다. 플랫폼은 작업 입력과 최종 답변 텍스트에 대해 크레딧을 차감하고, 반환된 이미지는 장당 ${IMAGE_CREDITS} 크레딧이 추가되며 이미지가 아닌 파일에는 추가 요금이 없습니다. 실행 횟수에는 별도 한도가 있습니다.`;
