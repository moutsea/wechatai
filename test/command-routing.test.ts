import { describe, expect, it } from "vitest";
import {
  leadingMention,
  nativeCommand,
  nativeCommandLane,
  platformCommand,
} from "../src/shared/command-routing";
import { pluginManifestSchema } from "../src/shared/plugins";
import { openClawManifest } from "../src/shared/openclaw";

describe("platform/native command boundary", () => {
  it.each([" ", "\n", "\t", "\u2005", "，", "， ", ",", ":", "：", "：\n"])(
    "recognizes a shortcut with separator %j and preserves the request text",
    (separator) => {
      expect(leadingMention(`@助理${separator}5 分钟之后提醒我喝水，顺便记一下：买茶。`)).toEqual({
        handle: "助理",
        content: "5 分钟之后提醒我喝水，顺便记一下：买茶。",
      });
    },
  );
  it("accepts full-width mentions without guessing names or reparsing nested commands", () => {
    expect(leadingMention("　＠助理，5 分钟之后提醒我 ")).toEqual({
      handle: "助理",
      content: "5 分钟之后提醒我",
    });
    expect(leadingMention("@claw，/new")).toEqual({ handle: "claw", content: "/new" });
    expect(leadingMention("@claw，@画图 一只猫")).toEqual({
      handle: "claw",
      content: "@画图 一只猫",
    });
    expect(leadingMention("@助理员，你好")?.handle).toBe("助理员");
    expect(leadingMention("@助理今天记账")?.handle).toBe("助理今天记账");
    expect(leadingMention("请 @助理 提醒我")).toBeNull();
    expect(leadingMention("/use 助理")).toBeNull();
    expect(leadingMention("@助理，")).toEqual({ handle: "助理", content: "" });
    expect(leadingMention("@，你好")).toEqual({ handle: "", content: "你好" });
    expect(leadingMention("@助理 : 原样保留")).toEqual({ handle: "助理", content: ": 原样保留" });
  });
  it("keeps platform commands explicit and global switching predictable", () => {
    expect(platformCommand("/wx new", true)).toBe("/new");
    expect(platformCommand("/WX clear AbC123", true)).toBe("/clear AbC123");
    expect(platformCommand("/wx", true)).toBe("/help");
    expect(platformCommand("/use My Agent", true)).toBe("/use My Agent");
    expect(platformCommand("/exit", true)).toBe("/exit");
    for (const text of ["/new", "/help", "/status", "/model Provider/Model", "/future arg"])
      expect(platformCommand(text, true)).toBeNull();
    expect(platformCommand("/new", false)).toBe("/new");
    expect(platformCommand("@claw /exit", true)).toBeNull();
    expect(platformCommand("解释 /new", true)).toBeNull();
    expect(nativeCommand("/STOP")).toBe("stop");
    expect(nativeCommandLane("/STOP")).toBe("control");
    expect(nativeCommandLane("/stop tell me a story")).toBe("message");
    expect(nativeCommand("不要 /stop")).toBeNull();
  });
  it("keeps old protocol manifests valid without granting native command handling", () => {
    const { commands: _, ...capabilities } = openClawManifest.capabilities;
    expect(
      pluginManifestSchema.parse({ ...openClawManifest, capabilities }).capabilities.commands,
    ).toBe("platform");
  });
});
