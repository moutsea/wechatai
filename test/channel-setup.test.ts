import { describe, expect, it, vi } from "vitest";
import { saveChannelSetup, modelImportMessage } from "../src/client/channel-setup";
import { api } from "../src/client/api";
import type { Channel, ChannelInput, ModelImportResult } from "../src/shared/types";

const input: ChannelInput = {
  name: "DeepSeek",
  description: "",
  protocol: "chat-completions",
  baseUrl: "https://api.deepseek.com",
  color: "sage",
  apiKey: " test-key ",
};
const saved: Channel = {
  name: input.name,
  description: "",
  protocol: input.protocol,
  baseUrl: input.baseUrl,
  color: input.color,
  id: "created-channel",
  hasKey: true,
  createdAt: 1,
};
const imported: ModelImportResult = { total: 2, imported: 2, existing: 0, invalid: 0, limited: 0 };

describe("channel setup and model discovery", () => {
  it("saves first and imports using the returned channel id", async () => {
    const request = vi
      .fn<typeof api>()
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce(imported);
    expect(await saveChannelSetup(request as typeof api, input, undefined, true)).toEqual({
      channel: saved,
      models: imported,
    });
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/channels",
      "/channels/created-channel/models/import",
    ]);
    expect(JSON.parse(request.mock.calls[0][1]!.body as string).apiKey).toBe("test-key");
  });

  it("keeps a successful save when an unsupported catalog fails, without fallback requests", async () => {
    const request = vi
      .fn<typeof api>()
      .mockResolvedValueOnce(saved)
      .mockRejectedValueOnce(new Error("模型列表接口不存在（404）"));
    expect(await saveChannelSetup(request as typeof api, input, undefined, true)).toEqual({
      channel: saved,
      importError: "模型列表接口不存在（404）",
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not import after a failed save", async () => {
    const request = vi.fn<typeof api>().mockRejectedValueOnce(new Error("渠道达到上限"));
    await expect(saveChannelSetup(request as typeof api, input, undefined, true)).rejects.toThrow(
      "渠道达到上限",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps edits and custom setup independent from catalog discovery", async () => {
    const request = vi.fn<typeof api>().mockResolvedValue(saved);
    await saveChannelSetup(
      request as typeof api,
      { ...input, apiKey: "", name: "改名" },
      saved,
      true,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(request.mock.calls[0][1]!.body as string)).not.toHaveProperty("apiKey");
    request.mockClear();
    await saveChannelSetup(request as typeof api, input, undefined, false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("blocks blank keys for a new or changed destination before calling the server", async () => {
    const request = vi.fn<typeof api>();
    await expect(
      saveChannelSetup(request as typeof api, { ...input, apiKey: " " }, undefined, true),
    ).rejects.toThrow("请输入 API Key");
    await expect(
      saveChannelSetup(
        request as typeof api,
        { ...input, baseUrl: "https://api.other.test/v1", apiKey: "" },
        saved,
        false,
      ),
    ).rejects.toThrow("服务地址已更改");
    expect(request).not.toHaveBeenCalled();
  });

  it("saves a KimiSeek protocol-only edit without asking for its hidden key again", async () => {
    const previous: Channel = {
      ...saved,
      integration: "kimiseek",
      baseUrl: "https://api.kimiseek.app",
    };
    const request = vi.fn<typeof api>().mockResolvedValue(previous);
    await saveChannelSetup(
      request as typeof api,
      { ...previous, protocol: "responses", apiKey: "" },
      previous,
      false,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(`/channels/${previous.id}`);
    const body = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(body.protocol).toBe("responses");
    expect(body.baseUrl).toBe(previous.baseUrl);
    expect(body).not.toHaveProperty("apiKey");
  });

  it("explains empty catalogs and partially imported lists", () => {
    expect(
      modelImportMessage({ ...imported, total: 1, imported: 0, incompatible: 1 }, 50),
    ).toContain("跳过 1 个与当前协议不兼容的模型，可调整渠道协议后重新获取");
    expect(modelImportMessage({ ...imported, total: 0, imported: 0 }, 20)).toContain(
      "请手动添加模型",
    );
    expect(
      modelImportMessage(
        { ...imported, total: 28, imported: 20, existing: 2, invalid: 1, limited: 5 },
        20,
      ),
    ).toBe("已导入 20 个模型；2 个已存在；跳过 1 条无效记录；渠道最多 20 个模型，另有 5 个未导入");
  });
});
