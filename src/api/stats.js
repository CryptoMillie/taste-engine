/**
 * Supabase aggregate queries for taste stats.
 */
import { supabase } from "./supabase";

/**
 * Fetch global win rates per category from the items table.
 * @returns {Object|null} { [cat]: { wins, comparisons, winRate } } or null if unavailable
 */
export async function fetchGlobalCategoryAverages() {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("items")
      .select("cat, wins, comparisons")
      .gt("comparisons", 0);

    if (error || !data?.length) return null;

    const cats = {};
    for (const row of data) {
      if (!cats[row.cat]) cats[row.cat] = { wins: 0, comparisons: 0 };
      cats[row.cat].wins += row.wins;
      cats[row.cat].comparisons += row.comparisons;
    }

    for (const cat of Object.keys(cats)) {
      const c = cats[cat];
      c.winRate = c.comparisons > 0 ? c.wins / c.comparisons : 0;
    }

    return cats;
  } catch {
    return null;
  }
}

/**
 * Compute how similar user's taste is to the global average.
 * @param {Object} userStats — { [cat]: { winRate } }
 * @param {Object} globalStats — { [cat]: { winRate } }
 * @returns {number} similarity percentage (0-100)
 */
export function computeTasteTwinPercent(userStats, globalStats) {
  if (!userStats || !globalStats) return 50;

  const cats = Object.keys(userStats).filter((c) => globalStats[c]);
  if (!cats.length) return 50;

  let totalDiff = 0;
  for (const cat of cats) {
    totalDiff += Math.abs(userStats[cat].winRate - globalStats[cat].winRate);
  }

  const avgDiff = totalDiff / cats.length;
  // Convert to similarity: 0 diff = 100%, 0.5 diff = 0%
  return Math.round(Math.max(0, Math.min(100, (1 - avgDiff * 2) * 100)));
}

/**
 * Fetch head-to-head vote data between two items.
 * @param {string} itemA — item ID
 * @param {string} itemB — item ID
 * @returns {{ aWins: number, bWins: number, total: number }|null}
 */
export async function fetchHeadToHead(itemA, itemB) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc("get_head_to_head", {
      p_item_a: itemA,
      p_item_b: itemB,
    });

    if (error || !data) return null;

    return {
      aWins: data.a_wins ?? 0,
      bWins: data.b_wins ?? 0,
      total: data.total ?? 0,
    };
  } catch {
    // RPC not deployed — graceful fallback
    return null;
  }
}
