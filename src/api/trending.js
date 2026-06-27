/**
 * Client-side trending API — fetches live DeSearch items from Supabase
 * and pairs them into matchups for the trending section.
 */
import { supabase } from "./supabase";

/**
 * Fetch live trending items (source='desearch') and pair them into matchups.
 * @returns {Array<{ id, itemA, itemB, category, refreshedAt }>}
 */
export async function fetchLiveTrending() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("items")
      .select("id, name, sub, cat, img, rating, refreshed_at")
      .eq("source", "desearch")
      .order("refreshed_at", { ascending: false })
      .limit(20);

    if (error || !data?.length) return [];

    // Group by category, then pair adjacent items
    const byCategory = {};
    for (const item of data) {
      const cat = item.cat || "trending";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(item);
    }

    const matchups = [];
    for (const [cat, items] of Object.entries(byCategory)) {
      for (let i = 0; i + 1 < items.length; i += 2) {
        matchups.push({
          id: `live_${items[i].id}_${items[i + 1].id}`,
          itemA: items[i],
          itemB: items[i + 1],
          category: cat,
          refreshedAt: items[i].refreshed_at,
        });
      }
    }

    return matchups;
  } catch {
    return [];
  }
}
