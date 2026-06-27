/**
 * Prediction staking API — place stakes and query markets.
 */
import { supabase } from "./supabase";

/**
 * Place a stake on a matchup prediction.
 * @returns {{ stakeId: string|null, error: string|null }}
 */
export async function placeStake({ userId, itemA, itemB, predictedWinner, amount }) {
  if (!supabase || !userId) return { stakeId: null, error: "Not authenticated" };
  try {
    const { data, error } = await supabase.rpc("place_stake", {
      p_user_id: userId,
      p_item_a: itemA,
      p_item_b: itemB,
      p_predicted_winner: predictedWinner,
      p_amount: amount,
    });
    if (error) return { stakeId: null, error: error.message };
    return { stakeId: data, error: null };
  } catch (err) {
    return { stakeId: null, error: err.message };
  }
}

/**
 * Fetch open market for a pair (if any).
 */
export async function fetchMarketForPair(itemA, itemB) {
  if (!supabase) return null;
  const orderedA = itemA < itemB ? itemA : itemB;
  const orderedB = itemA < itemB ? itemB : itemA;
  try {
    const { data } = await supabase
      .from("matchup_markets")
      .select("*")
      .eq("item_a", orderedA)
      .eq("item_b", orderedB)
      .eq("status", "open")
      .single();
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Check if user has already staked on this pair's open market.
 */
export async function hasUserStaked(userId, itemA, itemB) {
  if (!supabase || !userId) return false;
  const orderedA = itemA < itemB ? itemA : itemB;
  const orderedB = itemA < itemB ? itemB : itemA;
  try {
    const { data: market } = await supabase
      .from("matchup_markets")
      .select("id")
      .eq("item_a", orderedA)
      .eq("item_b", orderedB)
      .eq("status", "open")
      .single();
    if (!market) return false;

    const { data: stake } = await supabase
      .from("stakes")
      .select("id")
      .eq("user_id", userId)
      .eq("market_id", market.id)
      .limit(1)
      .single();
    return !!stake;
  } catch {
    return false;
  }
}

/**
 * Fetch user's recent stakes with status info.
 */
export async function fetchUserStakes(userId, limit = 10) {
  if (!supabase || !userId) return [];
  try {
    const { data } = await supabase
      .from("stakes")
      .select("id, predicted_winner, amount, payout, status, created_at, market_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  } catch {
    return [];
  }
}
