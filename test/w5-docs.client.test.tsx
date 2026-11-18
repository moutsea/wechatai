import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { AnonymousAuthProvider } from "../src/client/auth";
import { DocArticlePage } from "../src/client/pages/docs";

function renderDoc(slug: string) {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/docs/${slug}`]}>
      <AnonymousAuthProvider>
        <DocArticlePage slug={slug} />
      </AnonymousAuthProvider>
    </MemoryRouter>,
  );
  return new DOMParser().parseFromString(html, "text/html");
}

it("directs each image-generation credit error to the right account or setting", () => {
  const items = Array.from(renderDoc("image-generation").querySelectorAll("#troubleshoot li"));
  const errorHelp = items
    .filter((item) => /余额|上限/.test(item.querySelector("strong")?.textContent ?? ""))
    .map((item) => item.textContent);
  expect(errorHelp).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/微伴.*余额不足.*每日额度刷新.*补充微伴额度/),
      expect.stringMatching(/单次 credits 上限不足.*模型设置.*提高.*上限/),
      expect.stringMatching(/上游.*余额或额度不足.*服务商.*账户/),
    ]),
  );
});

it("tells readers to retest the saved image binding and create a new config to switch models", () => {
  const guidance = renderDoc("image-generation").querySelector("#configure > p")?.textContent;
  expect(guidance).toMatch(/同一.*更新.*直接.*测试/);
  expect(guidance).toMatch(/已保存的插件不能更换模型.*新建插件配置/);
  expect(guidance).not.toContain("重新选择模型");
});

it("starts the attachment expiry window at the last successful addition", () => {
  const instructions = renderDoc("attachments").querySelector("#send")?.textContent;
  expect(instructions).toMatch(/最后一次成功追加.*重新计时.*15 分钟/);
  expect(instructions).not.toContain("距离首次发送超过 15 分钟");
});

it.each([
  ["attachments", "#formats"],
  ["image-generation", "#draw"],
])("tells readers of %s to resend attachments and instructions after switching", (slug, section) => {
  const paragraphs = renderDoc(slug).querySelectorAll(`${section} p`);
  const guidance = Array.from(paragraphs).find((p) => p.textContent?.includes("切换到聊天模型"));
  expect(guidance?.textContent).toMatch(/切换到聊天模型.*重发附件和处理要求/);
});

it("explains that clearing and deleting both erase cloud tasks but only deleting frees a slot", () => {
  const page = renderDoc("sessions");
  const history = Array.from(page.querySelectorAll("#history li"));
  const clear = history.find((item) => item.querySelector("strong")?.textContent === "清空消息");
  const remove = history.find((item) => item.querySelector("strong")?.textContent === "删除会话");
  expect(clear?.textContent).toMatch(/删除.*对应云端任务内容.*保留会话.*不释放会话名额/);
  expect(remove?.textContent).toMatch(/永久删除.*对应云端任务内容.*释放一个会话名额/);
  const help = Array.from(page.querySelectorAll("#troubleshoot li")).find((item) =>
    item.querySelector("strong")?.textContent?.includes("小薇任务记录不见了"),
  );
  expect(help?.textContent).toMatch(/清空或删除会话.*删除.*对应任务正文与结果.*账单保留/);
});

it("explains that explicit rejection of native tools can fall back to compatibility mode", () => {
  const items = renderDoc("ds-chat").querySelectorAll("#troubleshoot li");
  const guidance = Array.from(items).find((item) =>
    item.textContent?.includes("回答模型报工具调用错误"),
  );
  expect(guidance?.textContent).toMatch(/首次请求.*明确拒绝.*原生工具调用.*兼容模式.*JSON/);
});

it("does not tell DS Chat users that one exhausted tool ends the reply", () => {
  const items = renderDoc("ds-chat").querySelectorAll("#troubleshoot li");
  const guidance = Array.from(items).find((item) => item.textContent?.includes("阅读次数用完"));
  expect(guidance?.textContent).toMatch(/只限制该项.*已有资料.*回答.*另一项.*剩余次数/);
  expect(guidance?.textContent).not.toContain("本轮会提前结束");
});

it("directs users with no reply to check the bound account and connection diagnostics", () => {
  const answer = renderDoc("faq").querySelector("#no-reply p:not(.docs-faq-group)");
  expect(answer?.textContent).toMatch(/没有收到命令回复.*绑定的微信.*连接状态.*最近消息.*错误提示/);
  expect(answer?.textContent).not.toContain("说明消息没有进入微伴");
  expect(answer?.querySelector('a[href="/app/wechat"]')?.textContent).toBe("微信连接");
});

it("distinguishes a DS Chat test answer from a verified search", () => {
  const page = renderDoc("ds-chat");
  const setup = page.querySelector("#configure ol li:last-child")?.textContent;
  const help = Array.from(page.querySelectorAll("#troubleshoot li")).find((item) =>
    item.querySelector("strong")?.textContent?.includes("测试"),
  )?.textContent;
  expect(setup).toMatch(/可能直接回答.*不一定调用搜索服务/);
  expect(setup).toMatch(/按输入与最终输出扣 credits.*实际调用.*API 费用/);
  expect(help).toMatch(/最新.*平台附加的.*来源/);
  expect(help).not.toContain("测试也会真实调用搜索服务");
});

it("distinguishes saved upstream API keys from newly generated notification tokens", () => {
  const answer = renderDoc("faq").querySelector("#key-storage")?.textContent;
  expect(answer).toMatch(/已保存的上游 API Key.*不会回显明文/);
  expect(answer).toMatch(/通知 Token.*生成或重置时.*完整展示一次.*立即复制/);
  expect(answer).not.toContain("页面始终显示掩码");
});
