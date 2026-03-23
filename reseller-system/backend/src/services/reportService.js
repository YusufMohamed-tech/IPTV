const PDFDocument = require("pdfkit");

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    const serialized = headers.map((header) => {
      const value = row[header] == null ? "" : String(row[header]);
      return `"${value.replace(/"/g, '""')}"`;
    });
    lines.push(serialized.join(","));
  }

  return lines.join("\n");
}

function toPdf(title, rows) {
  const doc = new PDFDocument({ margin: 30 });
  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(title);
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text("No records available.");
      doc.end();
      return;
    }

    const headers = Object.keys(rows[0]);
    doc.fontSize(10).text(headers.join(" | "));
    doc.moveDown(0.5);

    for (const row of rows) {
      const line = headers.map((header) => String(row[header] ?? "")).join(" | ");
      doc.fontSize(9).text(line);
    }

    doc.end();
  });
}

module.exports = { toCsv, toPdf };
