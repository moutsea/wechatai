import { downloadImage, downloadMedia, type WxItem } from "../wechat";
import { extractFileText, safeFileName, MAX_BATCH_BYTES, MAX_ATTACHMENTS } from "../attachments";
import { AppError } from "../config";
import type { ModelMessage } from "../llm";
export async function parseAttachmentBatch(items: WxItem[]) {
  if (items.length > MAX_ATTACHMENTS)
    throw new AppError("attachment_count", "一次最多处理 4 个附件", 422);
  const images: NonNullable<ModelMessage["images"]> = [];
  const files: { name: string; text: string }[] = [];
  let bytes = 0;
  for (const item of items) {
    if (item.type === 2) {
      const image = await downloadImage(item);
      bytes += Buffer.byteLength(image.data, "base64");
      images.push(image);
    } else {
      const data = await downloadMedia(item);
      bytes += data.length;
      if (bytes > MAX_BATCH_BYTES)
        throw new AppError(
          "attachment_batch_size",
          "一批附件合计最大 8 MB，请用 /cancel 清空后分批发送",
        );
      const name = safeFileName(item.file_item?.file_name ?? "附件");
      files.push({ name, text: await extractFileText(name, data) });
    }
    if (bytes > MAX_BATCH_BYTES)
      throw new AppError(
        "attachment_batch_size",
        "一批附件合计最大 8 MB，请用 /cancel 清空后分批发送",
      );
  }
  return { images, files };
}
