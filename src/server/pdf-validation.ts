import { AppError } from "./config";

/** Parse page contents as well as the catalog: a header/EOF or readable page
 * count alone does not prove that a generated PDF can be opened and displayed. */
export async function verifyGeneratedPdf(data: Uint8Array) {
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const invalid = () =>
    new AppError("cloud_file_invalid", "云端没有返回完整可解析的 PDF 文件。", 502);
  if (
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    !bytes.subarray(-1024).includes(Buffer.from("%%EOF"))
  )
    throw invalid();
  const { getResolvedPDFJS } = await import("unpdf");
  const { getDocument } = await getResolvedPDFJS();
  const task = getDocument({
    // PDF.js may transfer its input buffer; keep the bytes saved and sent intact.
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    useWasm: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    if (!pdf.numPages) throw invalid();
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      try {
        // Does not require text: image-only and intentionally blank PDFs are valid.
        await page.getOperatorList();
      } finally {
        page.cleanup();
      }
    }
  } catch {
    throw invalid();
  } finally {
    await task.destroy();
  }
}
