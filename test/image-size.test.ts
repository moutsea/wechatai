import { describe, expect, it } from "vitest";
import { imageSizeFromPrompt } from "../src/server/plugins/image-size";

describe("image prompt canvas", () => {
  it.each([
    ["城市街景，3:4", "960x1280"],
    ["城市街景，３：４", "960x1280"],
    ["城市街景，3：4。", "960x1280"],
    ["城市街景 3 : 4", "960x1280"],
    ["画幅比例为3:4的海报", "960x1280"],
    ["图片宽高比 6:8，城市街景", "960x1280"],
    ["16:9 横版，山间日出", "1536x864"],
    ["山间日出，9:16 竖版", "864x1536"],
    ["海报 --ar 4:5", "1024x1280"],
    ["poster, aspect ratio: 5:4", "1280x1024"],
    ["全景图，21:9", "1792x768"],
    ["不要 1:1，比例改为 3:4", "960x1280"],
    ["比例 4:3，改成比例 3:2", "1536x1024"],
    ["画一只橘猫", undefined],
    ["城市夜景，时间 03:04", undefined],
    ["钟表显示 16:09:00", undefined],
    ["海报上的文字是“3:4”", undefined],
    ["图片中写 https://example.com/3:4", undefined],
    ["一场比分3:4的比赛", undefined],
  ])("interprets %s", (prompt, size) => {
    expect(imageSizeFromPrompt(prompt)).toBe(size);
  });
  it("rejects explicitly labelled unsupported ratios before generation", () => {
    expect(() => imageSizeFromPrompt("画幅比例 1:99")).toThrow("暂不支持这个画幅比例");
  });
});
