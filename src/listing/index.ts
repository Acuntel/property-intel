// Listing dispatcher: choose Redfin or Zillow based on the input, with a hard
// time budget so a blocked site never hangs the pull. Listing data is
// enrichment only — a null result is normal (off-market home, or anti-bot wall)
// and never fails the overall pull.
import { fetchRedfin } from "./redfin.js";
import { fetchZillow } from "./zillow.js";
import type { ListingInfo } from "../types.js";

const BUDGET_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function fetchListing(
  input: string,
): Promise<{ listing: ListingInfo | null; warning?: string }> {
  const isUrl = /^https?:\/\//i.test(input);
  const useZillow = isUrl && /zillow\.com/i.test(input);
  const fetcher = useZillow ? fetchZillow : fetchRedfin;
  const label = useZillow ? "Zillow" : "Redfin";

  try {
    return await withTimeout(fetcher(input), BUDGET_MS, label);
  } catch (e) {
    return {
      listing: null,
      warning: `${label}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
