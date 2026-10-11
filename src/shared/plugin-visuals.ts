export const roleAvatarIds = [
  "",
  "xingye",
  "shenyan",
  "wanqing",
  "zhiyao",
  "cenwu",
  "judeng",
] as const;
export type RoleAvatarId = (typeof roleAvatarIds)[number];

export const roleAvatarChoices = [
  { id: "xingye", name: "陆星野" },
  { id: "shenyan", name: "沈砚" },
  { id: "wanqing", name: "苏晚晴" },
  { id: "zhiyao", name: "许知遥" },
  { id: "cenwu", name: "岑雾" },
  { id: "judeng", name: "橘灯" },
] as const;

// Only built-in local assets are allowed; imported cards never load arbitrary URLs.
export function roleAvatarSource(id: string | undefined): string | undefined {
  return id && roleAvatarIds.some((allowed) => allowed === id)
    ? `/images/roles/${id}.webp`
    : undefined;
}

export function pluginIconSource(id: string): string | undefined {
  if (id === "wechatai/notification") return "/images/plugins/notification.svg";
  if (id === "wechatai/personal-assistant") return "/images/plugins/personal-assistant.svg";
  const icons: Record<string, string> = {
    "wechatai/roleplay": "roleplay",
    "wechatai/hermes": "hermes-brand",
    "wechatai/openclaw": "openclaw-brand",
    "wechatai/web-research": "ds-chat-brand",
    "wechatai/image-generation": "image-generation",
  };
  const name = Object.hasOwn(icons, id) ? icons[id] : undefined;
  return name ? `/images/plugins/${name}.webp` : undefined;
}
