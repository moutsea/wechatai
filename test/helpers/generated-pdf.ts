/** A real PDF with a catalog, page tree, content streams and byte-accurate xref. */
export function pdfWithStreams(streams: string[]) {
  const fontId = 3 + streams.length * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${streams.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${streams.length} >>`,
    ...streams.flatMap((stream, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ]),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let source = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(source));
    source += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

export function generatedPdf(text = "Weather report") {
  const escaped = text.replace(/[\\()]/g, "\\$&");
  return pdfWithStreams([`BT /F1 12 Tf 30 100 Td (${escaped}) Tj ET`]);
}

// The catalog and first page are valid, but the second page points to a missing
// object. Keep the replacement the same length so xref offsets remain correct.
export const pdfWithMissingPage = Buffer.from(
  pdfWithStreams(["q Q", "q Q"]).toString().replace("/Kids [3 0 R 5 0 R]", "/Kids [3 0 R 9 0 R]"),
);
