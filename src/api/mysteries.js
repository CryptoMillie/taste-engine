/**
 * Taste Mysteries API — mystery card operations.
 */
import { supabase } from "./supabase";

/**
 * Fetch active, unexpired mysteries.
 * @param {number} limit - Max mysteries to return.
 * @returns {Array} Array of mystery objects.
 */
export async function fetchActiveMysteries(limit = 3) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("fetch_active_mysteries", {
    p_limit: limit,
  });
  if (error) {
    console.error("[mysteries] fetchActiveMysteries error:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Submit a user's theory/explanation for a mystery.
 * Awards 10 coins on submission.
 * @param {string} mysteryId - UUID of the mystery.
 * @param {string} userId - User ID.
 * @param {string} explanation - The user's theory text.
 * @returns {{ id: string, coinsAwarded: number }|null}
 */
export async function submitMysteryExplanation(mysteryId, userId, explanation) {
  if (!supabase || !mysteryId || !userId || !explanation?.trim()) return null;

  const { data, error } = await supabase
    .from("mystery_explanations")
    .insert({
      mystery_id: mysteryId,
      user_id: userId,
      explanation: explanation.trim(),
      coins_awarded: 10,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[mysteries] submitExplanation error:", error.message);
    return null;
  }

  // Award 10 coins
  await supabase.rpc("award_coins", {
    p_user_id: userId,
    p_amount: 10,
    p_reason: "mystery_theory",
    p_reference_id: mysteryId,
  });

  // Increment mystery vote_count
  const { data: mystery } = await supabase
    .from("taste_mysteries")
    .select("vote_count")
    .eq("id", mysteryId)
    .single();
  if (mystery) {
    await supabase
      .from("taste_mysteries")
      .update({ vote_count: (mystery.vote_count || 0) + 1 })
      .eq("id", mysteryId);
  }

  return { id: data.id, coinsAwarded: 10 };
}

/**
 * Fetch explanations for a mystery, sorted by upvotes.
 * @param {string} mysteryId - UUID of the mystery.
 * @param {number} limit - Max explanations to return.
 * @returns {Array}
 */
export async function fetchMysteryExplanations(mysteryId, limit = 10) {
  if (!supabase || !mysteryId) return [];
  const { data, error } = await supabase
    .from("mystery_explanations")
    .select("id, user_id, explanation, upvotes, coins_awarded, created_at")
    .eq("mystery_id", mysteryId)
    .order("upvotes", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}
