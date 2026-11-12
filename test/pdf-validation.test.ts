import { describe, expect, it } from "vitest";
import { extractFileText } from "../src/server/attachments";
import { verifyGeneratedPdf } from "../src/server/pdf-validation";
import { generatedPdf, pdfWithStreams, pdfWithMissingPage } from "./helpers/generated-pdf";

describe("generated PDF validation", () => {
  it("accepts a readable PDF without changing the bytes used for storage and delivery", async () => {
    const data = generatedPdf("Actual PDF contents");
    const original = Buffer.from(data);
    await verifyGeneratedPdf(data);
    expect(data).toEqual(original);
    expect(await extractFileText("result.pdf", data)).toContain("Actual PDF contents");
  });

  it.each([
    { label: "graphics without extractable text", streams: ["q 1 0 0 rg 10 10 40 40 re f Q"] },
    { label: "an intentionally blank page", streams: [""] },
    { label: "multiple pages", streams: ["q Q", "q Q"] },
  ])("accepts $label", async ({ streams }) => {
    await expect(verifyGeneratedPdf(pdfWithStreams(streams))).resolves.toBeUndefined();
  });

  it.each([
    { label: "header and EOF only", data: Buffer.from("%PDF-1.4\nfixture\n%%EOF\n") },
    { label: "a missing page tree", data: pdfWithStreams([]) },
    {
      label: "a missing second page despite a valid catalog and first page",
      data: pdfWithMissingPage,
    },
    { label: "a truncated file", data: generatedPdf().subarray(0, -20) },
  ])("rejects $label as a permanent file failure", async ({ data }) => {
    await expect(verifyGeneratedPdf(data)).rejects.toMatchObject({ code: "cloud_file_invalid" });
  });
});
