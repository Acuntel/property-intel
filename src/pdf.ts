// Render the HTML report to PDF via the bundled Chromium (no anti-bot involved —
// this is local HTML rendering, the same approach as il-association-leads).
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { reportToHtml } from "./report.js";
import type { PropertyRecord } from "./types.js";

export async function writePdf(
  records: PropertyRecord[],
  outPath: string,
): Promise<void> {
  const html = reportToHtml(records);
  mkdirSync(dirname(outPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: outPath,
      printBackground: true,
      format: "Letter",
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
  } finally {
    await browser.close();
  }
}
