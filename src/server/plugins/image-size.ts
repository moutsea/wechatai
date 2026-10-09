import { AppError } from "../config";

// Moderate resolutions, all below 2.25 MP. These are per-request choices, never
// saved as a default or inferred from an old plugin's fixed-size configuration.
const ratioSizes: Record<string, string> = {
  "1:1": "1024x1024",
  "3:4": "960x1280",
  "4:3": "1280x960",
  "2:3": "1024x1536",
  "3:2": "1536x1024",
  "9:16": "864x1536",
  "16:9": "1536x864",
  "4:5": "1024x1280",
  "5:4": "1280x1024",
  "21:9": "1792x768",
  "9:21": "768x1792",
};

export function imageSizeFromPrompt(prompt: string): string | undefined {
  prompt = prompt.normalize("NFKC");
  let selected: string | undefined;
  for (const match of prompt.matchAll(
    /(?<![\d.:：])([1-9]\d?)\s*[:：]\s*([1-9]\d?)(?![\d:：])/gu,
  )) {
    const before = prompt.slice(0, match.index);
    const after = prompt.slice(match.index + match[0].length);
    const labelled = /(?:宽高比|比例|画幅|aspect\s+ratio|--ar)\s*(?:为|是|[:：=])?\s*$/i.test(
      before,
    );
    const standalone =
      /(?:^|[\s,，;；])\s*$/.test(before) &&
      /^\s*(?:$|[,，;；。.!?？！]|横版|竖版|横图|竖图|比例|画幅)/.test(after);
    // A ratio in a time, URL or quoted image text is not a canvas instruction.
    if (!labelled && !standalone) continue;
    const width = Number(match[1]),
      height = Number(match[2]);
    const supported = Object.keys(ratioSizes).find((ratio) => {
      const [w, h] = ratio.split(":").map(Number);
      return w * height === h * width;
    });
    if (supported) selected = ratioSizes[supported];
    else if (labelled)
      throw new AppError(
        "image_ratio",
        "暂不支持这个画幅比例，请使用 1:1、3:4、4:3、2:3、3:2、9:16、16:9、4:5、5:4、21:9 或 9:21",
        422,
      );
  }
  return selected;
}
