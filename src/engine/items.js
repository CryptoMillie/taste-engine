/**
 * Unified item loader.
 * Loads seeds as fallback, merges trending + Wikidata results.
 * Deduplicates by name, assigns IDs, syncs to Supabase items table.
 */
import { SEED_ITEMS } from "../data/seeds";
import { fetchTrending } from "./trending";
import { fetchAllCategories } from "./wikidata";
import { supabase } from "../api/supabase";

const BASE = 1200;

/**
 * Deduplicate items by normalized name.
 */
function dedup(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Assign stable IDs to items.
 */
function assignIds(items) {
  return items.map((item, i) => ({
    ...item,
    id: item.id ?? "i" + i,
    rating: item.rating ?? BASE,
    comparisons: item.comparisons ?? 0,
    wins: item.wins ?? 0,
  }));
}

/**
 * Sync items to Supabase (upsert). Fire-and-forget.
 */
async function syncToSupabase(items) {
  if (!supabase) return;
  try {
    const rows = items.map((it) => ({
      id: it.id,
      name: it.name,
      sub: it.sub,
      cat: it.cat,
      img: it.img,
      rating: it.rating,
      comparisons: it.comparisons,
      wins: it.wins,
    }));
    await supabase.from("items").upsert(rows, { onConflict: "id" });
  } catch {
    // Sync failure is non-critical
  }
}

/**
 * Load all items: seeds + trending + Wikidata.
 * Returns items ready for the store.
 */
export async function loadAllItems() {
  let all = [...SEED_ITEMS];

  // Fetch trending and Wikidata in parallel, non-blocking
  const [trendingResult, wikidataResult] = await Promise.allSettled([
    fetchTrending(20),
    fetchAllCategories(),
  ]);

  if (trendingResult.status === "fulfilled" && trendingResult.value.length) {
    all = [...all, ...trendingResult.value];
  }

  if (wikidataResult.status === "fulfilled" && wikidataResult.value.length) {
    all = [...all, ...wikidataResult.value];
  }

  const unique = dedup(all);
  const withIds = assignIds(unique);

  // Background sync to Supabase
  syncToSupabase(withIds);

  return withIds;
}
