/**
 * Wikidata SPARQL fetcher for deep category pulls.
 * Queries Wikidata for entities with images + descriptions.
 * Results cached in localStorage (refresh daily).
 */

const SPARQL_URL = "https://query.wikidata.org/sparql";

const CACHE_KEY = "taste-wikidata-cache";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Category → Wikidata class (Q-id) + label for display
const CATEGORY_QUERIES = {
  athletes: {
    qid: "Q5",
    filter: "?item wdt:P106 wd:Q2066131.",
    cat: "trending",
    sub: "ATHLETE",
  },
  musicians: {
    qid: "Q5",
    filter: "?item wdt:P106 wd:Q639669.",
    cat: "music",
    sub: "MUSICIAN",
  },
  cars: {
    qid: "Q3231690",
    filter: "",
    cat: "cars",
    sub: "AUTOMOBILE",
  },
  animals: {
    qid: "Q16521",
    filter: "?item wdt:P141 wd:Q211005.", // only least concern (common animals)
    cat: "animals",
    sub: "ANIMAL",
  },
  foods: {
    qid: "Q746549",
    filter: "",
    cat: "food",
    sub: "DISH",
  },
  movies: {
    qid: "Q11424",
    filter: "",
    cat: "movies",
    sub: "FILM",
  },
  cities: {
    qid: "Q515",
    filter: "",
    cat: "cities",
    sub: "CITY",
  },
};

function buildQuery(category, limit = 30) {
  const cfg = CATEGORY_QUERIES[category];
  if (!cfg) return null;

  return `
    SELECT ?item ?itemLabel ?itemDescription ?image WHERE {
      ?item wdt:P31 wd:${cfg.qid}.
      ${cfg.filter}
      ?item wdt:P18 ?image.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT ${limit}
  `;
}

async function runQuery(sparql) {
  const url = `${SPARQL_URL}?query=${encodeURIComponent(sparql)}&format=json`;
  const res = await fetch(url, {
    headers: { Accept: "application/sparql-results+json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results?.bindings ?? [];
}

function toCommonsThumb(url, width = 640) {
  // Convert Wikidata commons file URL to a thumbnail
  if (!url) return null;
  const match = url.match(/Special:FilePath\/(.+)/);
  if (!match) return url;
  const file = decodeURIComponent(match[1]);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${commonsHash(file)}/${file}/${width}px-${file}`;
}

function commonsHash(filename) {
  // Wikimedia uses MD5 hash for file paths — but we can use the direct URL instead
  // Just return the image URL as-is from Wikidata
  return "";
}

/**
 * Fetch items from Wikidata for a given category.
 * @param {string} category - One of: athletes, musicians, cars, animals, foods, movies, cities
 * @param {number} limit - Max results
 * @returns {Promise<Array<{name: string, sub: string, cat: string, img: string}>>}
 */
export async function fetchCategory(category, limit = 20) {
  const cfg = CATEGORY_QUERIES[category];
  if (!cfg) return [];

  const sparql = buildQuery(category, limit * 2);
  const bindings = await runQuery(sparql);

  return bindings
    .filter((b) => b.itemLabel?.value && b.image?.value)
    .filter((b) => !b.itemLabel.value.startsWith("Q")) // skip unlabeled
    .map((b) => ({
      name: b.itemLabel.value,
      sub: (b.itemDescription?.value ?? cfg.sub).toUpperCase().slice(0, 60),
      cat: cfg.cat,
      img: b.image.value,
    }))
    .slice(0, limit);
}

/**
 * Fetch items from all categories, with localStorage caching.
 * @returns {Promise<Array<{name: string, sub: string, cat: string, img: string}>>}
 */
export async function fetchAllCategories() {
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

  const categories = Object.keys(CATEGORY_QUERIES);
  const results = await Promise.allSettled(
    categories.map((cat) => fetchCategory(cat, 15))
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
