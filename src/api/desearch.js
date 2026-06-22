/**
 * DeSearch API client — pulls trending entities from web + X/Twitter.
 * Expands the item pool dynamically so matchups stay fresh.
 *
 * Uses the /web endpoint for fast JSON responses, then enriches
 * with Wikipedia images.
 */

const DESEARCH_URL = "https://api.desearch.ai/web";
const DESEARCH_KEY = import.meta.env.VITE_DESEARCH_API_KEY;

const WIKI_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";

const CACHE_KEY = "taste-desearch-cache";
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

const CATEGORY_QUERIES = {
  trending: "most famous celebrities and public figures trending right now 2026",
  sports: "top trending athletes and sports stars this week 2026",
  music: "most popular musicians and music artists trending right now 2026",
  food: "most popular foods and dishes people love 2026",
  cars: "most popular cars and new car models 2026",
  animals: "most popular animals and viral pets trending",
  movies: "top trending movies and TV shows right now 2026",
};

/**
 * Fetch a Wikipedia summary + thumbnail for a given entity name.
 * Returns { name, sub, img } or null.
 */
async function fetchWikiEntity(name) {
  try {
    const encoded = encodeURIComponent(name.replace(/\s+/g, "_"));
    const res = await fetch(`${WIKI_SUMMARY_URL}/${encoded}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.thumbnail?.source) return null;
    return {
      name: data.titles?.normalized || name,
      sub: (data.description || "").toUpperCase().slice(0, 60),
      img: data.thumbnail.source.replace(/\/\d+px-/, "/640px-"),
    };
  } catch {
    return null;
  }
}

/**
 * Extract entity names from DeSearch web results snippets.
 * Looks for capitalized proper nouns and known name patterns.
 */
function extractNamesFromResults(results) {
  const names = new Set();
  for (const r of results) {
    const text = `${r.title || ""} ${r.snippet || ""}`;
    // Match capitalized names (2-4 words, each starting with uppercase)
    const matches = text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}\b/g) || [];
    for (const m of matches) {
      // Filter out common non-entity words
      const skip = /^(The|This|These|That|Those|Top|Best|Most|New|Get|See|How|Why|What|Our|More|From|With|About|After|Over|Just|Has|Was|Are|Were|Can|Will|May|For|But|And|Not|All|Some|Any|Each|Every|First|Last|Next|Here|Also|Even|Back|Into|Only|Than|Then|Both|Like|Make|Made|Find|Many|Much|Such|Very|Your|They|Their|Them|Been|Being|Have|Having|Does|Doing|Would|Could|Should|Might|Must|Shall|Need|Used|Use|Using|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)$/;
      if (m.length > 3 && !skip.test(m.split(" ")[0])) {
        names.add(m);
      }
    }
  }
  return [...names];
}

/**
 * Query DeSearch for trending entities in a category.
 */
async function fetchCategoryFromDesearch(category, count = 8) {
  if (!DESEARCH_KEY) return [];

  const query = CATEGORY_QUERIES[category];
  if (!query) return [];

  try {
    const url = `${DESEARCH_URL}?query=${encodeURIComponent(query)}&num=15`;
    const res = await fetch(url, {
      headers: { Authorization: DESEARCH_KEY },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const results = data.data || data.results || [];
    if (!results.length) return [];

    // Extract entity names from search results
    const names = extractNamesFromResults(results);

    // Try to resolve each name via Wikipedia (gets image + clean description)
    const resolved = await Promise.allSettled(
      names.slice(0, count * 2).map((name) => fetchWikiEntity(name))
    );

    return resolved
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => ({
        ...r.value,
        cat: category === "trending" ? "trending" : category,
        sub: r.value.sub || category.toUpperCase(),
      }))
      .slice(0, count);
  } catch {
    return [];
  }
}

/**
 * Fetch trending items across categories from DeSearch.
 * Cached in localStorage for 2 hours.
 */
export async function fetchTrendingFromDesearch() {
  if (!DESEARCH_KEY) return [];

  // Check cache
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL && Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch {
    // Cache miss
  }

  // Fetch priority categories in parallel
  const priorityCats = ["trending", "sports", "music", "food", "movies"];
  const results = await Promise.allSettled(
    priorityCats.map((cat) => fetchCategoryFromDesearch(cat, 8))
  );

  const all = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // Cache results
  if (all.length > 0) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: all, ts: Date.now() }));
    } catch {
      // Storage full
    }
  }

  return all;
}
