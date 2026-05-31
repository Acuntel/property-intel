#!/usr/bin/env node
// property-intel CLI
//   pull <address|redfin-url|zillow-url> [options]
//
// Options:
//   --listing            enrich with Redfin/Zillow listing data (best-effort)
//   --address "<addr>"   explicit address when the input is a URL
//   --out <basename>     output basename (default: derived from address)
//   --json|--csv|--pdf   choose formats (default: all three)
//   --print              also print the record to stdout
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pull } from "./pull.js";
import { recordsToCsv, recordsToJson } from "./output.js";
import { writePdf } from "./pdf.js";
import type { PropertyRecord } from "./types.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

function slug(r: PropertyRecord): string {
  return (
    `${r.address}-${r.city}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "property"
  );
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const input = process.argv[3];
  if (cmd !== "pull" || !input || input.startsWith("--")) {
    process.stderr.write(
      'Usage: property-intel pull "<address|redfin-url|zillow-url>" [--listing] [--address "..."] [--out name] [--json] [--csv] [--pdf] [--print]\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`→ Pulling ${input}\n`);
  const record = await pull(input, {
    withListing: has("listing"),
    address: flag("address"),
  });

  // default: emit all formats unless a specific one is requested
  const anySpecific = has("json") || has("csv") || has("pdf");
  const doJson = !anySpecific || has("json");
  const doCsv = !anySpecific || has("csv");
  const doPdf = !anySpecific || has("pdf");

  const base = flag("out") ?? slug(record);
  const outDir = join(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];

  if (doJson) {
    const p = join(outDir, `${base}.json`);
    writeFileSync(p, recordsToJson([record]));
    written.push(p);
  }
  if (doCsv) {
    const p = join(outDir, `${base}.csv`);
    writeFileSync(p, recordsToCsv([record]));
    written.push(p);
  }
  if (doPdf) {
    const p = join(outDir, `${base}.pdf`);
    await writePdf([record], p);
    written.push(p);
  }

  process.stdout.write(
    `\n${record.address}, ${record.city} ${record.state}\n` +
      `  County/Township : ${record.county} / ${record.township}\n` +
      `  PIN             : ${record.pin || "—"}\n` +
      `  Owner           : ${record.ownerName ?? "—"}\n` +
      `  Lot             : ${record.lotSqft ? `${record.lotSqft.toLocaleString()} sqft` : "—"}\n` +
      `  Assessed value  : ${record.assessedValue != null ? `$${record.assessedValue.toLocaleString()}` : "—"}\n` +
      `  Property tax    : ${record.taxAmount != null ? `$${record.taxAmount.toLocaleString()}` : "—"}\n` +
      `  Beds/Baths/Sqft : ${record.beds ?? "—"} / ${record.baths ?? "—"} / ${record.sqft ?? "—"}\n` +
      `  List price      : ${record.price != null ? `$${record.price.toLocaleString()}` : "—"}\n`,
  );
  if (record.warnings.length) {
    process.stdout.write(
      `  Warnings:\n${record.warnings.map((w) => `    ⚠ ${w}`).join("\n")}\n`,
    );
  }
  if (has("print")) process.stdout.write(`\n${recordsToJson([record])}`);
  process.stdout.write(
    `\nWrote:\n${written.map((w) => `  ${w}`).join("\n")}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `Error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
