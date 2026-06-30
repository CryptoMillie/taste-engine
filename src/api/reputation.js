/**
 * Taste Reputation + RLHF API — reputation multiplier and data contribution operations.
 */
import { supabase } from "./supabase";

/**
 * Fetch user's taste reputation and details.
 * @returns {{ reputation: number, totalRecentVotes: number, highQualityVotes: number, updatedAt: string|null }}
 */
export async function fetchReputation(userId) {
  if (!supabase || !userId) return { reputation: 1.0, totalRecentVotes: 0, highQualityVotes: 0, updatedAt: null };
  try {
    const { data, error } = await supabase.rpc("fetch_taste_reputation", {
      p_user_id: userId,
    });
    if (error) {
      console.error("fetch_taste_reputation error:", error.message);
      return { reputation: 1.0, totalRecentVotes: 0, highQualityVotes: 0, updatedAt: null };
    }
    return {
      reputation: Number(data.reputation) || 1.0,
      totalRecentVotes: data.total_recent_votes || 0,
      highQualityVotes: data.high_quality_votes || 0,
      updatedAt: data.updated_at,
    };
  } catch {
    return { reputation: 1.0, totalRecentVotes: 0, highQualityVotes: 0, updatedAt: null };
  }
}

/**
 * Recalculate user's taste reputation (fire-and-forget after vote).
 */
export async function updateReputation(userId) {
  if (!supabase || !userId) return;
  try {
    await supabase.rpc("update_taste_reputation", { p_user_id: userId });
  } catch {
    // fire-and-forget
  }
}

/**
 * Fetch user's RLHF contribution stats.
 * @returns {{ highQualityVotes: number, dividendsEarned: number, optedIn: boolean }}
 */
export async function fetchRlhfStats(userId) {
  if (!supabase || !userId) return { highQualityVotes: 0, dividendsEarned: 0, optedIn: true };
  try {
    const { data, error } = await supabase.rpc("get_rlhf_user_stats", {
      p_user_id: userId,
    });
    if (error) {
      console.error("get_rlhf_user_stats error:", error.message);
      return { highQualityVotes: 0, dividendsEarned: 0, optedIn: true };
    }
    return {
      highQualityVotes: data.high_quality_votes || 0,
      dividendsEarned: Number(data.dividends_earned) || 0,
      optedIn: data.opted_in !== false,
    };
  } catch {
    return { highQualityVotes: 0, dividendsEarned: 0, optedIn: true };
  }
}

/**
 * Toggle RLHF opt-in status.
 */
export async function toggleRlhfOptIn(userId, optedIn) {
  if (!supabase || !userId) return;
  try {
    await supabase
      .from("users")
      .update({ rlhf_opted_in: optedIn })
      .eq("id", userId);
  } catch {
    // ignore
  }
}
