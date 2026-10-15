type ReplyPayload = {
  text?: string;
  isError?: boolean;
  isReasoning?: boolean;
  isStatusNotice?: boolean;
  isFallbackNotice?: boolean;
  isCompactionNotice?: boolean;
  mediaUrl?: string;
  mediaUrls?: string[];
};

export const PARTIAL_FAILURE_NOTICE = "提示：处理过程中有部分步骤报错，请留意结果是否完整。";

// OpenClaw can return a valid final answer followed by a separate tool warning.
// An error payload alone is not evidence that the entire turn failed.
export class AgentReply {
  private chunks: string[] = [];
  private sawError = false;
  private deliveryFailed = false;

  constructor(private readonly options: { command?: boolean } = {}) {}

  accept(payload: ReplyPayload, kind: string) {
    if (payload.isError) {
      this.sawError = true;
      return;
    }
    if (
      kind !== "final" ||
      payload.isReasoning ||
      payload.isFallbackNotice ||
      payload.isCompactionNotice ||
      // Native commands such as /compact return their result as a status notice.
      // The same marker during a normal Agent turn is only progress, not an answer.
      (payload.isStatusNotice && !this.options.command)
    )
      return;
    if (payload.text?.trim()) this.chunks.push(payload.text);
    if (payload.mediaUrl || payload.mediaUrls?.length)
      this.chunks.push("此渠道暂不支持附件，请在 OpenClaw 查看生成的文件。");
  }

  failDelivery() {
    this.deliveryFailed = true;
  }

  finish(alreadySent: boolean): string | null {
    if (this.deliveryFailed) throw new Error("Agent reply delivery failed");
    if (this.chunks.length) {
      const text = this.chunks.join("\n\n");
      // Never forward raw tool errors: they can include commands or credentials.
      return this.sawError ? `${text}\n\n${PARTIAL_FAILURE_NOTICE}` : text;
    }
    if (this.sawError) throw new Error("Agent dispatch failed");
    return alreadySent ? null : "";
  }
}
