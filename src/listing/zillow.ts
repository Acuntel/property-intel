// Zillow listing adapter (fallback / cross-check). Zillow's public API was
// retired in 2021; the data lives in the page's embedded __NEXT_DATA__ /
// hdpApolloPreloadedData cache. We load the page with Playwright and extract
// the property object. Zillow's anti-bot (PerimeterX/HUMAN + Cloudflare) is
// aggressive, so this is best-effort and flagged when blocked.
import { openSession } from "./browser.js";
import type { ListingInfo } from "../types.js";

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

// Walk the gdpClientCache / Apollo cache for the first object carrying resoFacts.
function findProperty(obj: unknown, depth = 0): Record<string, any> | null {
  if (!obj || typeof obj !== "object" || depth > 6) return null;
  const o = obj as Record<string, unknown>;
  if ("resoFacts" in o || ("bedrooms" in o && "livingArea" in o)) {
    return o as Record<string, any>;
  }
  for (const v of Object.values(o)) {
    const hit = findProperty(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export async function fetchZillow(
  input: string,
): Promise<{ listing: ListingInfo | null; warning?: string }> {
  if (!/^https?:\/\//i.test(input) || !/zillow\.com/i.test(input)) {
    return { listing: null, warning: "Zillow: needs a zillow.com listing URL" };
  }

  let session;
  try {
    session = await openSession(input);
  } catch (e) {
    return {
      listing: null,
      warning: `Zillow: browser launch failed (${msg(e)})`,
    };
  }

  try {
    const nextJson = await session.page
      .locator("script#__NEXT_DATA__")
      .first()
      .textContent({ timeout: 8000 })
      .catch(() => null);

    let root: unknown = null;
    if (nextJson) {
      const parsed = JSON.parse(nextJson);
      const cache = parsed?.props?.pageProps?.componentProps?.gdpClientCache;
      root = typeof cache === "string" ? JSON.parse(cache) : (cache ?? parsed);
    }
    if (!root) {
      const apollo = await session.page
        .locator("script#hdpApolloPreloadedData")
        .first()
        .textContent({ timeout: 5000 })
        .catch(() => null);
      if (apollo) root = JSON.parse(apollo);
    }
    if (!root) {
      return {
        listing: null,
        warning: "Zillow: embedded data not found (likely challenged)",
      };
    }

    const p = findProperty(root);
    if (!p)
      return { listing: null, warning: "Zillow: property object not in cache" };

    const f = p["resoFacts"] ?? {};
    const listing: ListingInfo = {
      price: num(p["price"]),
      beds: num(p["bedrooms"]) ?? num(f["bedrooms"]),
      baths: num(p["bathrooms"]) ?? num(f["bathrooms"]),
      sqft: num(p["livingArea"]) ?? num(f["livingArea"]),
      yearBuilt: num(p["yearBuilt"]) ?? num(f["yearBuilt"]),
      propertyType: p["homeType"] ?? f["homeType"],
      status: p["homeStatus"],
      mlsNumber: f["mlsId"] ?? p["mlsid"],
      description: p["description"],
      photos: [],
      url: input,
      source: "Zillow",
    };
    return { listing };
  } catch (e) {
    return {
      listing: null,
      warning: `Zillow: blocked or parse error (${msg(e)})`,
    };
  } finally {
    await session.close().catch(() => {});
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
