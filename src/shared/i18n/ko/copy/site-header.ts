import type { Locale } from "../../index";

export const navLabels = {
  "/": "홈",
  "/pricing": "가격",
  "/docs": "문서",
  "/#how": "사용 방법",
} as const;

export const headerCopy = {
  home: "홈",
  topNav: "주요 메뉴",
  account: "계정",
  login: "로그인",
  start: "무료로 시작",
  workspace: "워크스페이스 열기",
  workspaceFallback: "워크스페이스",
  openMenu: "메뉴 열기",
  closeMenu: "메뉴 닫기",
  menuFailed: "계정 메뉴를 불러오지 못했습니다",
  reloadMenu: "계정 메뉴 새로고침",
} as const;

export const languageCopy = {
  navigation: "언어",
  labels: { "zh-CN": "중국어", ja: "일본어" } as Partial<Record<Locale, string>>,
} as const;
