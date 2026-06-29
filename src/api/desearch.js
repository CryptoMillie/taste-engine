/**
 * DeSearch API client — pulls trending entities from web + X/Twitter.
 * Expands the item pool dynamically so matchups stay fresh.
 *
 * Uses /web endpoint for search results, then Chutes to extract
 * clean entity names, then Wikipedia for images.
 */

const DESEARCH_URL = "https://api.desearch.ai/api/v1/search/web";
const DESEARCH_KEY = import.meta.env.VITE_DESEARCH_API_KEY;
const CHUTES_URL = "https://chutes-deepseek-ai-deepseek-v3-2-tee.chutes.ai/v1/chat/completions";
const CHUTES_KEY = import.meta.env.VITE_CHUTES_API_KEY;

const WIKI_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";

const CACHE_KEY = "taste-desearch-cache";
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

const CATEGORY_QUERIES = {
  trending: "most famous celebrities trending right now site:wikipedia.org",
  sports: "top athletes and sports stars 2026 site:wikipedia.org",
  music: "popular musicians and singers trending 2026 site:wikipedia.org",
  food: "most popular foods and dishes worldwide site:wikipedia.org",
  movies: "top trending movies and TV shows 2026 site:wikipedia.org",
  anime: "top trending anime series and characters 2026 site:wikipedia.org",
  gaming: "most popular video games and esports 2026 site:wikipedia.org",
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
 * Use Chutes to extract real entity names from search result text.
 * Returns an array of name strings.
 */
async function extractNamesWithAI(results, category) {
  if (!CHUTES_KEY) return [];

  const snippets = results
    .slice(0, 8)
    .map((r) => `${r.title || ""}: ${r.snippet || r.description || ""}`)
    .join("\n");

  try {
    const res = await fetch(CHUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHUTES_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-ai/DeepSeek-V3.2-TEE",
        messages: [
          {
            role: "system",
            content: "Extract real, specific entity names from search results. Only include names of actual people, places, foods, movies, cars, or animals that have their own Wikipedia page. No generic terms.",
          },
          {
            role: "user",
            content: `Category: ${category}\n\nSearch results:\n${snippets}\n\nReturn ONLY a JSON array of 8-12 specific entity names. Example: ["Caitlin Clark", "Patrick Mahomes"]. No descriptions, no commentary.`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    const match = content.match(/\[[\s\S]*?\]/);
    if (!match) return [];

    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed.filter((n) => typeof n === "string" && n.length > 2);
    } catch {
      return [];
    }
    return [];
  } catch {
    return [];
  }
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
    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${DESEARCH_KEY}` },
    });

    // Fallback: try without Bearer prefix
    if (res.status === 401 || res.status === 403) {
      res = await fetch(url, {
        headers: { Authorization: DESEARCH_KEY },
      });
    }

    // Fallback: try old /web endpoint
    if (!res.ok) {
      const fallbackUrl = `https://api.desearch.ai/web?query=${encodeURIComponent(query)}&num=15`;
      res = await fetch(fallbackUrl, {
        headers: { Authorization: DESEARCH_KEY },
      });
    }

    if (!res.ok) return [];

    const data = await res.json();
    const results = data.data || data.results || data.organic_results || data.web?.results || [];
    if (!results.length) return [];

    // Use AI to extract clean entity names
    const names = await extractNamesWithAI(results, category);
    if (!names.length) return [];

    // Resolve each name via Wikipedia (gets image + clean description)
    const resolved = await Promise.allSettled(
      names.slice(0, count + 4).map((name) => fetchWikiEntity(name))
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
  const priorityCats = ["trending", "sports", "music", "food", "movies", "anime", "gaming"];
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
