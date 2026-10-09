export const GUIDE_PATH = "/guide";
export const COMMANDS_GUIDE_PATH = `${GUIDE_PATH}#commands`;

export const wechatCommands = [
  ["/help", "查看命令帮助和完整教程"],
  ["/status", "查看当前微信链接使用的插件；普通聊天时显示渠道和模型"],
  ["/channels", "查看全部渠道及编号"],
  ["/channel 2", "切换到第 2 个渠道，继续上次使用的模型"],
  ["/models", "查看当前渠道下的模型及编号"],
  ["/plugins", "Plus：查看已配置插件及 @快捷名称"],
  ["/use DS Chat", "Plus：按插件名称、快捷名或 /plugins 编号进入或直接切换插件，无需先退出"],
  ["/exit", "退出插件，返回进入前的普通模型会话；不删除任何记录"],
  ["/model 2", "切换到当前渠道的第 2 个普通模型，继续它最近的活动会话"],
  ["/new", "使用当前模型或插件新建会话，保留旧记录"],
  ["/sessions", "查看会话编号，标记当前和已归档会话"],
  ["/switch 2", "切换到刚列出的第 2 个会话；已归档会话会自动恢复"],
  ["/reset", "重置上下文与历史摘要，保留聊天记录"],
  ["/archive", "归档当前会话，并使用同一模型或插件新建会话"],
  ["/clear", "确认后清空当前会话的消息，保留会话"],
  ["/delete", "确认后删除当前会话，并新建空会话"],
  ["/balance", "查看可用 credits"],
  ["/cancel", "取消并清空暂存的图片或文件，不影响聊天记录"],
] as const;

// Use the configured site URL in both local development and production.
export function guideUrl(appUrl: string): string | null {
  try {
    const url = new URL(appUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return new URL(GUIDE_PATH, url.origin).toString();
  } catch {
    return null;
  }
}

function guideReference(appUrl: string) {
  const url = guideUrl(appUrl);
  return url
    ? `完整使用教程：\n[使用指南](${url})`
    : "完整使用教程：打开网页工作台左下角「使用指南」。";
}

export function wechatHelp(appUrl: string) {
  const commands = wechatCommands
    .map(([command, description]) => `- \`${command}\`：${description}`)
    .join("\n");
  return `**微信命令速查**\n\n${commands}\n\n以上命令不消耗 credits。\n\n${guideReference(appUrl)}`;
}

export function welcomeGuide(appUrl: string) {
  const url = guideUrl(appUrl);
  const commands = url
    ? `点击查看：[微信命令速查](${url}#commands)`
    : "查看「微信命令速查」：打开网页工作台左下角「使用指南」，选择同名章节。";
  return `你好，欢迎使用微伴 👋\n你的微信已连接，现在可以和你配置的 AI 聊天了。\n\n切换模型、开启新会话、查看额度怎么操作？\n${commands}`;
}
