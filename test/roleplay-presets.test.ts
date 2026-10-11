import { describe, expect, it } from "vitest";
import { createRoleplayFromPreset, roleplayPresets } from "../src/shared/roleplay-presets";
import { exportCharacterCard, readCharacterCard } from "../src/shared/character-card";
import { roleplayInputSchema } from "../src/shared/roleplay";
import { roleplayPrompt } from "../src/server/plugins/roleplay";
import { roleAvatarSource, pluginIconSource } from "../src/shared/plugin-visuals";

const context = { modelId: "my-existing-model", enabled: true, occupiedShortcuts: [] };

describe("built-in role presets", () => {
  it.each(roleplayPresets)(
    "$id creates a usable, exportable role on the user's model",
    (preset) => {
      const role = createRoleplayFromPreset(preset, context);
      expect(roleplayInputSchema.safeParse(role).success).toBe(true);
      expect(role.modelId).toBe(context.modelId);
      expect(role.avatar).toBe(preset.id);
      const prompt = roleplayPrompt(
        role,
        [{ role: "user", content: role.lore.flatMap((l) => l.keys).join(" ") }],
        8192,
      );
      expect(prompt.systemPrompt).toContain(role.description);
      expect(prompt.selected).toHaveLength(role.lore.length);
      const exported = exportCharacterCard(role);
      const restored = readCharacterCard(new TextEncoder().encode(JSON.stringify(exported)), {
        modelId: role.modelId,
        shortcut: role.shortcut,
      }).input;
      expect(restored.description).toBe(role.description);
      expect(restored.firstMessage).toBe(role.firstMessage);
      expect(restored.lore).toEqual(role.lore);
      expect(restored.avatar).toBe(role.avatar);
    },
  );

  it("never changes the template or another role when one copy is edited", () => {
    const template = roleplayPresets[0]!;
    const before = JSON.stringify(template);
    const first = createRoleplayFromPreset(template, context);
    const second = createRoleplayFromPreset(template, context);
    first.name = "我的角色";
    first.lore[0]!.keys.push("新关键词");
    first.lore[0]!.content = "用户改写背景";
    expect(JSON.stringify(template)).toBe(before);
    expect(second.lore[0]!.keys).not.toContain("新关键词");
    expect(second.lore[0]!.content).not.toBe(first.lore[0]!.content);
  });

  it("allocates a free shortcut across models and plugins without changing the display name", () => {
    const template = {
      ...roleplayPresets[0]!,
      character: { ...roleplayPresets[0]!.character, shortcut: "Role" },
    };
    const role = createRoleplayFromPreset(template, {
      ...context,
      occupiedShortcuts: ["role", "ROLE2", "Role3", "other"],
    });
    expect(role.shortcut).toBe("Role4");
    expect(role.name).toBe(template.character.name);
    const maxLength = {
      ...template,
      character: { ...template.character, shortcut: "a".repeat(24) },
    };
    expect(
      createRoleplayFromPreset(maxLength, { ...context, occupiedShortcuts: ["a".repeat(24)] })
        .shortcut,
    ).toBe("a".repeat(23) + "2");
  });

  it("preserves a disabled setting and does not silently choose a model when none exists", () => {
    const role = createRoleplayFromPreset(roleplayPresets[0]!, {
      ...context,
      modelId: "",
      enabled: false,
    });
    expect(role.modelId).toBe("");
    expect(role.enabled).toBe(false);
    expect(roleplayInputSchema.safeParse(role).success).toBe(false);
  });

  it("ignores remote avatar URLs in imported cards and resolves only local built-in assets", () => {
    const source = exportCharacterCard(createRoleplayFromPreset(roleplayPresets[0]!, context));
    const withRemoteAvatar = {
      ...source,
      data: {
        ...source.data,
        extensions: { wechatai: { avatar: "https://tracking.example/avatar.png" } },
      },
    };
    const restored = readCharacterCard(new TextEncoder().encode(JSON.stringify(withRemoteAvatar)), {
      modelId: context.modelId,
      shortcut: "角色",
    }).input;
    expect(restored.avatar).toBe("");
    expect(roleAvatarSource("../../private")).toBeUndefined();
    expect(roleAvatarSource(undefined)).toBeUndefined();
    expect(roleAvatarSource("xingye")).toBe("/images/roles/xingye.webp");
    expect(pluginIconSource("toString")).toBeUndefined();
    expect(pluginIconSource("wechatai/hermes")).toBe("/images/plugins/hermes-brand.webp");
  });
});
