// Shared Playwright session for listing sites. Redfin/Zillow sit behind
// CloudFront / Cloudflare / PerimeterX, which hard-403 plain HTTP requests
// (verified). A real browser navigation establishes the clearance cookie, after
// which we can call the site's own JSON endpoints from within the page context
// where the session is valid.
//
// Default is bundled-chromium headless (fast, but most likely to be challenged).
// For production reliability set PROPERTY_INTEL_HEADLESS=false to drive real
// Chrome (channel:"chrome") — the proven anti-bot path from il-association-leads.
import { chromium, type Browser, type Page } from "playwright";

const HEADLESS = process.env["PROPERTY_INTEL_HEADLESS"] !== "false";
const USE_CHROME = process.env["PROPERTY_INTEL_CHROME"] === "true";

export interface Session {
  page: Page;
  // Fetch a URL from within the page context (carries the clearance cookie).
  fetchText(url: string): Promise<string>;
  close(): Promise<void>;
}

export async function openSession(warmupUrl: string): Promise<Session> {
  const browser: Browser = await chromium.launch({
    headless: HEADLESS,
    ...(USE_CHROME ? { channel: "chrome" } : {}),
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();

  // Warm up: load a page on the target origin to pass the bot challenge.
  await page.goto(warmupUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);

  return {
    page,
    async fetchText(url: string): Promise<string> {
      return page.evaluate(async (u) => {
        const r = await fetch(u, {
          headers: { Accept: "application/json, text/plain, */*" },
          credentials: "include",
        });
        return r.text();
      }, url);
    },
    async close() {
      await browser.close();
    },
  };
}
