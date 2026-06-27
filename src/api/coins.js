/**
 * Taste Coins API — virtual currency operations.
 */
import { supabase } from "./supabase";

/**
 * Fetch user's coin balance and lifetime earned.
 * @returns {{ balance: number, lifetimeEarned: number }}
 */
export async function fetchCoinBalance(userId) {
  if (!supabase || !userId) return { balance: 0, lifetimeEarned: 0 };
  try {
    const { data } = await supabase
      .from("coin_balances")
      .select("balance, lifetime_earned")
      .eq("user_id", userId)
      .single();
    if (data) {
      return {
        balance: data.balance,
        lifetimeEarned: data.lifetime_earned,
      };
    }
  } catch { /* no row yet */ }
  return { balance: 0, lifetimeEarned: 0 };
}

/**
 * Award coins via RPC (atomic balance update + transaction log).
 * @returns {number} New balance
 */
export async function awardCoins(userId, amount, reason, referenceId = null) {
  if (!supabase || !userId) return 0;
  try {
    const { data, error } = await supabase.rpc("award_coins", {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_reference_id: referenceId,
    });
    if (error) {
      console.error("award_coins error:", error.message);
      return -1;
    }
    return data;
  } catch {
    return -1;
  }
}

/**
 * Fetch recent coin transactions.
 * @returns {Array<{ amount, reason, reference_id, balance_after, created_at }>}
 */
export async function fetchCoinHistory(userId, limit = 20) {
  if (!supabase || !userId) return [];
  try {
    const { data } = await supabase
      .from("coin_transactions")
      .select("amount, reason, reference_id, balance_after, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  } catch {
    return [];
  }
}
