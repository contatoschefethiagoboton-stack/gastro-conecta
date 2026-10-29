// Gerador de PDF simples (sem dependências): várias páginas, quebra de linha
// automática e acentuação em português via WinAnsiEncoding (Latin-1).

export type PdfBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "pair"; label: string; value: string }
  | { kind: "space" }
  | { kind: "signature"; label: string };

const PAGE_W = 595, PAGE_H = 842, MARGIN = 56, BOTTOM = 60;
const SIZES = { title: 15, heading: 11.5, text: 10, pair: 10 } as const;

/** Converte para Latin-1 com escapes octais; caracteres fora do Latin-1 viram aproximações. */
export function pdfText(input: string): string {
  const normalized = String(input ?? "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/•/g, "-").replace(/ /g, " ")
    .replace(/[\r\t]/g, " ");
  let out = "";
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 63;
    if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (code >= 32 && code < 127) out += ch;
    else if (code >= 160 && code <= 255) out += `\\${code.toString(8).padStart(3, "0")}`;
    else {
      const ascii = ch.normalize("NFKD").replace(/[^\x20-\x7e]/g, "");
      out += ascii || "?";
    }
  }
  return out;
}

// Largura média aproximada de Helvetica (em fração do tamanho da fonte).
const approxWidth = (text: string, size: number) => text.length * size * 0.5;

export function wrapText(text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text ?? "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (approxWidth(candidate, size) <= maxWidth) { line = candidate; continue; }
      if (line) lines.push(line);
      let rest = word;
      while (approxWidth(rest, size) > maxWidth) {
        const cut = Math.max(1, Math.floor(maxWidth / (size * 0.5)));
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

export function buildPdf(blocks: PdfBlock[], footer = ""): Buffer {
  const pages: string[][] = [[]];
  let y = PAGE_H - MARGIN;
  const width = PAGE_W - MARGIN * 2;
  const newPage = () => { pages.push([]); y = PAGE_H - MARGIN; };
  const write = (text: string, size: number, font: "F1" | "F2", x = MARGIN) => {
    if (y < BOTTOM + size) newPage();
    pages[pages.length - 1].push(`BT /${font} ${size} Tf ${x} ${y.toFixed(1)} Td (${pdfText(text)}) Tj ET`);
    y -= size * 1.45;
  };
  for (const block of blocks) {
    if (block.kind === "space") { y -= 8; continue; }
    if (block.kind === "title") { for (const l of wrapText(block.text, SIZES.title, width)) write(l, SIZES.title, "F2"); y -= 6; continue; }
    if (block.kind === "heading") { y -= 6; for (const l of wrapText(block.text, SIZES.heading, width)) write(l, SIZES.heading, "F2"); continue; }
    if (block.kind === "text") { for (const l of wrapText(block.text, SIZES.text, width)) write(l, SIZES.text, "F1"); y -= 3; continue; }
    if (block.kind === "pair") {
      const lines = wrapText(`${block.label}: ${block.value || "não informado"}`, SIZES.pair, width);
      lines.forEach(l => write(l, SIZES.pair, "F1"));
      continue;
    }
    if (block.kind === "signature") {
      y -= 26;
      if (y < BOTTOM + 30) newPage();
      pages[pages.length - 1].push(`${MARGIN} ${y.toFixed(1)} m ${MARGIN + 260} ${y.toFixed(1)} l S`);
      y -= 12;
      write(block.label, 9, "F1");
    }
  }

  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const catalogId = add("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = add("PAGES");
  const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  pages.forEach((ops, index) => {
    const foot = `BT /F1 8 Tf ${MARGIN} 30 Td (${pdfText(`${footer}${footer ? " - " : ""}Página ${index + 1} de ${pages.length}`)}) Tj ET`;
    const stream = ["0.6 w", ...ops, foot].join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  void catalogId;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
