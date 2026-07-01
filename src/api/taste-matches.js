/**
 * Taste Matches API — twin/nemesis pair operations.
 */
import { supabase } from "./supabase";

/**
 * Fetch twin + nemesis matches for a user.
 * @param {string} userId - User ID.
 * @returns {{ twin: object|null, nemesis: object|null }}
 */
export async function fetchTasteMatches(userId) {
  if (!supabase || !userId) return { twin: null, nemesis: null };
  try {
    const { data, error } = await supabase
      .from("taste_matches")
      .select("match_user_id, similarity_score, match_type, category_breakdown, updated_at")
      .eq("user_id", userId);

    if (error || !data?.length) return { twin: null, nemesis: null };

    const twin = data.find((m) => m.match_type === "twin") || null;
    const nemesis = data.find((m) => m.match_type === "nemesis") || null;

    return { twin, nemesis };
  } catch {
    return { twin: null, nemesis: null };
  }
}

/**
 * Trigger fresh twin/nemesis computation for a user.
 * @param {string} userId - User ID.
 * @returns {{ twin: object|null, nemesis: object|null }}
 */
export async function computeTasteMatches(userId) {
  if (!supabase || !userId) return { twin: null, nemesis: null };
  const { data, error } = await supabase.rpc("compute_taste_matches", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[taste-matches] compute error:", error.message);
    return { twin: null, nemesis: null };
  }
  return data || { twin: null, nemesis: null };
}
