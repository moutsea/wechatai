/**
 * Muse 指南的常见问题。指南 Markdown 与 `/developers/muse` 的 FAQPage
 * 结构化数据都从这里生成，避免可见答案与 schema 各自漂移。
 */
export interface MuseFaqItem {
  question: string;
  answer: string;
}

export const MUSE_FAQ: readonly MuseFaqItem[] = [
  {
    question: "插件页一直没显示「Muse 已连接」？",
    answer:
      "只有 hook 实际轮询成功后才显示在线，安装成功或 dry run 完成都不代表已连接。先让 Muse 检查该配置 hook 的启用状态与日志，确认已按 SETUP.md 注册并启用；hook 默认每 5 秒触发，最长 15 秒长轮询，正常在线时无需刷新网页。若 Muse 刚完成安装，还要等它启用 hook 后的第一次成功轮询。",
  },
  {
    question: "微信收不到回复？",
    answer:
      "微伴只接收 Muse 提交的最终回复，思考与工具进度不转发。先在已绑定的微信发 /wx help 恢复返回通道，再用 /wx status 确认当前仍在 Muse；然后确认 Muse 已完成工具操作并通过 reply 提交了最终回复。网络故障、插件停用或会员权限暂停时，结果保留在本地发送队列，恢复后自动重试；本地入队或微伴确认接收都不代表微信已送达。",
  },
  {
    question: "连接指令过期了怎么办？",
    answer:
      "连接指令十分钟内有效，过期后到插件页重新生成，旧指令不再可用。新指令同样只发给自己的 Muse 主聊天，不要在本机终端执行，也不要公开分享其中的一次性配对信息。同一指令在有效期内可在原环境重试。",
  },
  {
    question: "hook 未注册或没有启用？",
    answer:
      "安装程序只保存配对和本配置的脚本，不会自动调用 Muse 的 hook 管理工具。需要 Muse 读取生成的 SETUP.md，在你的托管环境中注册并启用 hook，并按安装包 WORKER.md 将最终回复提交给微伴。未完成这一步时微伴不会显示在线，微信任务也不会被领取；只在终端试运行安装程序不能替代注册与启用。",
  },
  {
    question: "额度暂停时任务会丢吗？",
    answer:
      "余额不足时，微伴拒绝新任务、暂停主动通知，但已受理任务无需等待额度恢复，仍可回传结果，成功后照常结算。主动通知保留在本地发送队列，额度恢复后使用相同事件 ID 重试；普通任务结果优先回传。网络故障、插件停用或会员权限暂停时，待回传结果也会保留，恢复后使用相同事件 ID 重试，不重复执行工具或计费。待执行任务保留 24 小时。关闭插件的主动推送开关后不能再发送新通知，被拒绝的通知也不会在重新开启后补发。",
  },
  {
    question: "可以和别人共用同一个 Muse 环境吗？",
    answer:
      "不要给互不信任的用户共用。不同 route 只分别保存近期文字记录，这不是 Muse 原生会话隔离；同一托管环境仍共享长期记忆、工具及文件。需要区分用户时，请为各自准备独立的 Muse 环境和插件配置。",
  },
];

export const museFaqMarkdown = MUSE_FAQ.map(
  (item) => `### ${item.question}\n\n${item.answer}`,
).join("\n\n");
