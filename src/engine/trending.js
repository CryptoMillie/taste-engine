/**
 * Fetch trending entities from Wikipedia's free Pageviews API.
 * No API key needed. Returns top viewed articles for a given date.
 *
 * Usage:
 *   const items = await fetchTrending();  // yesterday's top 20
 *
 * Each item: { name, sub, cat, img }
 *
 * Rate limits: ~100 req/hr per IP (generous for daily fetch).
 * Cache the result — call once/day max.
 */

const WIKI_TOP_URL =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access";

const WIKI_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";

// Articles to skip (meta pages, not real entities)
const SKIP = new Set([
  "Main_Page",
  "Special:Search",
  "Wikipedia:Featured_pictures",
  "Portal:Current_events",
  "Deaths_in_2026",
  "Deaths_in_2025",
]);

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/**
 * Fetches top trending Wikipedia articles and enriches them with thumbnail images.
 * @param {number} count - How many items to return (default 20)
 * @returns {Promise<Array<{name: string, sub: string, cat: string, img: string}>>}
 */
export async function fetchTrending(count = 20) {
  const date = yesterday();
  const res = await fetch(`${WIKI_TOP_URL}/${date}`);
  if (!res.ok) throw new Error(`Pageviews API error: ${res.status}`);

  const data = await res.json();
  const articles = data.items?.[0]?.articles ?? [];

  // Filter out meta pages, take top candidates
  const candidates = articles
    .filter((a) => !SKIP.has(a.article) && !a.article.startsWith("Special:"))
    .slice(0, count * 2); // fetch extras in case some lack images

  // Enrich with summaries (parallel, batched)
  const enriched = await Promise.allSettled(
    candidates.map(async (a) => {
      const summaryRes = await fetch(`${WIKI_SUMMARY_URL}/${a.article}`);
      if (!summaryRes.ok) return null;
      const summary = await summaryRes.json();
      if (!summary.thumbnail?.source) return null;
      return {
        name: summary.titles?.normalized ?? a.article.replace(/_/g, " "),
        sub: (summary.description ?? "TRENDING").toUpperCase(),
        cat: "trending",
        img: summary.thumbnail.source.replace(/\/\d+px-/, "/640px-"),
      };
    })
  );

  return enriched
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value)
    .slice(0, count);
}
