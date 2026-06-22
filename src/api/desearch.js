/**
 * DeSearch API client — pulls trending entities from web + X/Twitter.
 * Expands the item pool dynamically so matchups stay fresh.
 */

const DESEARCH_URL = "https://api.desearch.ai/ai/search";
const DESEARCH_KEY = import.meta.env.VITE_DESEARCH_API_KEY;

const WIKI_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";

const CACHE_KEY = "taste-desearch-cache";
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours (fresher than Wikidata's 24h)

const CATEGORY_PROMPTS = {
  trending: "most talked about celebrities and public figures right now",
  sports: "trending athletes and sports stars this week",
  music: "popular musicians and artists trending right now",
  food: "viral foods, dishes, and restaurants people are talking about",
  cars: "trending cars, new car releases, and automotive news",
  animals: "popular animals and pets trending on social media",
  movies: "trending movies, TV shows, and entertainment right now",
  cities: "trending travel destinations and cities in the news",
};

/**
 * Fetch a Wikipedia thumbnail for a given entity name.
 * Returns null if not found.
 */
async function fetchWikiImage(name) {
  try {
    const encoded = encodeURIComponent(name.replace(/\s+/g, "_"));
    const res = await fetch(`${WIKI_SUMMARY_URL}/${encoded}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.thumbnail?.source) return null;
    return data.thumbnail.source.replace(/\/\d+px-/, "/640px-");
  } catch {
    return null;
  }
}

/**
 * Query DeSearch for trending entities in a category.
 * @param {string} category - Category key from CATEGORY_PROMPTS
 * @param {number} count - Max items to return
 * @returns {Promise<Array<{name, sub, cat, img}>>}
 */
async function fetchCategoryFromDesearch(category, count = 8) {
  if (!DESEARCH_KEY) return [];

  const prompt = CATEGORY_PROMPTS[category];
  if (!prompt) return [];

  try {
    const res = await fetch(DESEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DESEARCH_KEY}`,
      },
      body: JSON.stringify({
        prompt: `List ${count} specific ${prompt}. For each, give ONLY the name and a 2-4 word description. Format as JSON array: [{"name":"...","desc":"..."}]. No commentary.`,
        tools: ["web", "twitter"],
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const summary = data.search_summary || data.result || "";

    // Extract JSON array from response
    const jsonMatch = summary.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    // Enrich with Wikipedia images in parallel
    const enriched = await Promise.allSettled(
      parsed.slice(0, count).map(async (item) => {
        const img = await fetchWikiImage(item.name);
        return {
          name: item.name,
          sub: (item.desc || category).toUpperCase().slice(0, 60),
          cat: category === "trending" ? "trending" : category,
          img: img || null,
        };
      })
    );

    return enriched
      .filter((r) => r.status === "fulfilled" && r.value && r.value.img)
      .map((r) => r.value);
  } catch {
    return [];
  }
}

/**
 * Fetch trending items across all categories from DeSearch.
 * Cached in localStorage for 4 hours.
 * @returns {Promise<Array<{name, sub, cat, img}>>}
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

  // Fetch 3-4 categories to keep it fast (not all 8)
  const priorityCats = ["trending", "sports", "music", "food"];
  const results = await Promise.allSettled(
    priorityCats.map((cat) => fetchCategoryFromDesearch(cat, 6))
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
