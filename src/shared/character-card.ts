import { z } from "zod";
import { roleplayInputSchema, type RoleplayInput, type LoreEntry } from "./roleplay";
import { roleAvatarSource } from "./plugin-visuals";

const MAX_CARD_BYTES = 64000;
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const string = (v: unknown) => (typeof v === "string" ? v : "");
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()) : [];
const integer = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isSafeInteger(v) ? v : fallback;

// Files stay in the browser. Only bounded text settings are submitted to the API.
export function readCharacterCard(
  bytes: Uint8Array,
  defaults: Pick<RoleplayInput, "modelId" | "shortcut">,
) {
  if (bytes.length > 5 * 1024 * 1024) throw new Error("角色卡文件不能超过 5 MB");
  let json: string;
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((v, i) => bytes[i] === v)) throw new Error("PNG 文件格式不正确");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let payload: Uint8Array | undefined;
    for (let pos = 8; pos + 12 <= bytes.length;) {
      const length = view.getUint32(pos);
      if (length > bytes.length - pos - 12) throw new Error("PNG 文件不完整");
      const kind = new TextDecoder().decode(bytes.subarray(pos + 4, pos + 8));
      if (kind === "tEXt") {
        const data = bytes.subarray(pos + 8, pos + 8 + length);
        const nul = data.indexOf(0);
        if (nul >= 0 && new TextDecoder().decode(data.subarray(0, nul)) === "chara") {
          if (payload) throw new Error("PNG 中有重复的角色信息，请改用 JSON 角色卡");
          payload = data.subarray(nul + 1);
        }
      }
      pos += length + 12;
      if (kind === "IEND") break;
    }
    if (!payload) throw new Error("未找到 V2 角色信息，请选择带 chara 元数据的 PNG 或 V2 JSON");
    if (payload.length > MAX_CARD_BYTES * 1.4) throw new Error("角色卡文字信息不能超过 64 KB");
    try {
      const decoded = atob(new TextDecoder().decode(payload));
      if (decoded.length > MAX_CARD_BYTES) throw new Error();
      json = new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(decoded, (c) => c.charCodeAt(0)),
      );
    } catch {
      throw new Error("角色卡编码无效或文字信息超过 64 KB");
    }
  } else {
    if (bytes.length > MAX_CARD_BYTES) throw new Error("JSON 角色卡不能超过 64 KB");
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  let source: Record<string, unknown>;
  try {
    source = record(JSON.parse(json));
  } catch {
    throw new Error("角色卡不是有效的 JSON 文件");
  }
  if (source.spec !== "chara_card_v2" || source.spec_version !== "2.0")
    throw new Error("目前支持 Character Card V2（chara_card_v2 / 2.0），请先导出为 V2 格式");
  const data = record(source.data);
  const book = record(data.character_book);
  const entries = Array.isArray(book.entries) ? book.entries : [];
  const warnings = new Set<string>();
  if (entries.length > 50) throw new Error("世界书最多支持 50 条，请精简后再导入");
  const lore: LoreEntry[] = entries.map((item) => {
    const entry = record(item);
    const extensions = record(entry.extensions);
    const unsupported =
      entry.use_regex === true ||
      extensions.use_regex === true ||
      (entry.enabled !== false && entry.constant !== true && strings(entry.keys).length === 0);
    if (unsupported) warnings.add("正则或无关键词的非常驻条目已停用，请手动设置关键词后启用。");
    return {
      name: string(entry.name) || string(entry.comment),
      keys: strings(entry.keys),
      secondaryKeys: entry.selective === true ? strings(entry.secondary_keys) : [],
      content: string(entry.content),
      enabled: entry.enabled !== false && !unsupported,
      constant: entry.constant === true,
      caseSensitive: entry.case_sensitive === true,
      priority: Math.max(
        -10000,
        Math.min(10000, integer(entry.priority, integer(entry.insertion_order, 0))),
      ),
    };
  });
  if (entries.length)
    warnings.add(
      "世界书按关键词、常驻开关和优先级运行；不支持递归触发、正则、概率、脚本或自定义插入位置。",
    );
  if (/\{\{(?!char\}\}|user\}\})/i.test(json))
    warnings.add("只替换 {{char}} 和 {{user}}；其他宏保留为普通文字，不执行。");
  warnings.add(
    "仅导入文字设定，PNG 封面不保存。备用开场白与其他扩展仅保留在原始 JSON 中，不会执行或自动加载。",
  );
  const result = roleplayInputSchema.safeParse({
    ...defaults,
    name: string(data.name),
    avatar: roleAvatarSource(string(record(record(data.extensions).wechatai).avatar))
      ? string(record(record(data.extensions).wechatai).avatar)
      : "",
    userName: string(record(record(data.extensions).wechatai).userName) || "你",
    userPersona: string(record(record(data.extensions).wechatai).userPersona),
    description: string(data.description) || string(data.personality),
    personality: string(data.personality),
    scenario: string(data.scenario),
    firstMessage: string(data.first_mes),
    examples: string(data.mes_example),
    instructions: string(data.system_prompt),
    postHistoryInstructions: string(data.post_history_instructions),
    lore,
    loreTokenBudget: Math.max(0, Math.min(4000, integer(book.token_budget, 1000))),
    sourceCard: JSON.stringify(source),
  });
  if (!result.success) throw new Error(`角色卡内容超出限制：${z.prettifyError(result.error)}`);
  return { input: result.data, warnings: [...warnings] };
}

export function exportCharacterCard(role: RoleplayInput) {
  let source: Record<string, unknown> = {};
  try {
    source = record(JSON.parse(role.sourceCard));
  } catch {
    /* A manually created role has no source card. */
  }
  const old = record(source.data);
  const book = record(old.character_book);
  return {
    ...source,
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      ...old,
      name: role.name,
      description: role.description,
      personality: role.personality,
      scenario: role.scenario,
      first_mes: role.firstMessage,
      mes_example: role.examples,
      system_prompt: role.instructions,
      post_history_instructions: role.postHistoryInstructions,
      creator_notes: string(old.creator_notes),
      alternate_greetings: strings(old.alternate_greetings),
      tags: strings(old.tags),
      creator: string(old.creator),
      character_version: string(old.character_version),
      extensions: {
        ...record(old.extensions),
        wechatai: { userName: role.userName, userPersona: role.userPersona, avatar: role.avatar },
      },
      character_book: {
        ...book,
        token_budget: role.loreTokenBudget,
        entries: role.lore.map((entry, i) => ({
          // Original extensions remain in sourceCard, downloadable separately.
          id: i,
          keys: entry.keys,
          secondary_keys: entry.secondaryKeys,
          selective: entry.secondaryKeys.length > 0,
          content: entry.content,
          enabled: entry.enabled,
          constant: entry.constant,
          case_sensitive: entry.caseSensitive,
          name: entry.name,
          insertion_order: entry.priority,
          priority: entry.priority,
          extensions: {},
        })),
      },
    },
  };
}
