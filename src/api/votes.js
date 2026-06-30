/**
 * Submit votes to Supabase in the background.
 * Non-blocking: fire-and-forget after localStorage save.
 */
import { supabase } from "./supabase";
import { QUALITY_THRESHOLD } from "./quality";
import { awardCoins } from "./coins";
import { updateReputation } from "./reputation";

// Coin economy rates
const BASE_COINS = 10;
const STREAK_BONUS = { 3: 2, 7: 5, 14: 10 };
const SPEED_ROUND_BONUS = 3;

function getStreakBonus(streakDays) {
  if (streakDays >= 14) return STREAK_BONUS[14];
  if (streakDays >= 7) return STREAK_BONUS[7];
  if (streakDays >= 3) return STREAK_BONUS[3];
  return 0;
}

/**
 * @param {Object} params
 * @param {string} params.userId - Supabase user ID
 * @param {string} params.winnerId - Winner item ID
 * @param {string} params.loserId - Loser item ID
 * @param {string|null} params.campaignId - Campaign ID if campaign vote
 * @param {number} params.qualityScore - Quality score 0-1
 * @param {number} params.timeTakenMs - Time taken in ms
 * @param {string} params.sessionId - Session identifier
 * @param {number} [params.streakDays] - Current streak length
 * @param {boolean} [params.isSpeedRound] - Whether this is a speed round vote
 * @returns {Promise<{earned: boolean, amount: number, coinsEarned: number}>}
 */
export async function submitVote({
  userId,
  winnerId,
  loserId,
  campaignId,
  qualityScore,
  timeTakenMs,
  sessionId,
  streakDays = 0,
  isSpeedRound = false,
  reputation = 1.0,
}) {
  if (!supabase) return { earned: false, amount: 0, coinsEarned: 0 };

  try {
    // Insert vote
    await supabase.from("votes").insert({
      user_id: userId,
      winner_id: winnerId,
      loser_id: loserId,
      campaign_id: campaignId || null,
      quality_score: qualityScore,
      time_taken_ms: timeTakenMs,
      session_id: sessionId,
      source: "human",
    });

    let usdEarned = false;
    let usdAmount = 0;

    // Credit earnings if campaign vote with sufficient quality
    if (campaignId && qualityScore >= QUALITY_THRESHOLD) {
      // Atomic increment of campaign spent via RPC to prevent race conditions
      const { data: result, error } = await supabase.rpc("try_campaign_payout", {
        p_campaign_id: campaignId,
        p_user_id: userId || null,
      });

      // Fallback: direct read + guarded update if RPC doesn't exist yet
      if (error) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("payout_per_vote, budget_usdc, spent_usdc")
          .eq("id", campaignId)
          .single();

        if (campaign && campaign.spent_usdc + campaign.payout_per_vote <= campaign.budget_usdc) {
          usdAmount = Number(campaign.payout_per_vote);
          usdEarned = true;

          await supabase.rpc("increment_campaign_spent", {
            p_campaign_id: campaignId,
            p_amount: usdAmount,
          }).catch(() => {
            supabase
              .from("campaigns")
              .update({ spent_usdc: campaign.spent_usdc + usdAmount })
              .eq("id", campaignId)
              .lte("spent_usdc", campaign.budget_usdc - usdAmount);
          });
        }
      } else if (result && result.amount > 0) {
        usdEarned = true;
        usdAmount = result.amount;
      }
    }

    // Award Taste Coins if quality is sufficient (multiplied by reputation)
    let coinsEarned = 0;
    if (userId && qualityScore >= QUALITY_THRESHOLD) {
      coinsEarned = Math.floor(BASE_COINS * reputation) + getStreakBonus(streakDays);
      if (isSpeedRound) coinsEarned += SPEED_ROUND_BONUS;
      awardCoins(userId, coinsEarned, "vote", `${winnerId}_vs_${loserId}`).catch(() => {});
      // Fire-and-forget reputation recalculation
      updateReputation(userId).catch(() => {});
    }

    // Increment market votes if an open market exists for this pair
    try {
      const orderedA = winnerId < loserId ? winnerId : loserId;
      const orderedB = winnerId < loserId ? loserId : winnerId;
      const { data: market } = await supabase
        .from("matchup_markets")
        .select("id, item_a")
        .eq("item_a", orderedA)
        .eq("item_b", orderedB)
        .eq("status", "open")
        .single();

      if (market) {
        const forA = winnerId === market.item_a;
        await supabase.rpc("increment_market_votes", {
          p_market_id: market.id,
          p_for_a: forA,
        });
      }
    } catch { /* no open market — fine */ }

    return { earned: usdEarned, amount: usdAmount, coinsEarned };
  } catch {
    return { earned: false, amount: 0, coinsEarned: 0 };
  }
}
