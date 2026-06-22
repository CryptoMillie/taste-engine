/**
 * Submit votes to Supabase in the background.
 * Non-blocking: fire-and-forget after localStorage save.
 */
import { supabase } from "./supabase";
import { QUALITY_THRESHOLD } from "./quality";

/**
 * @param {Object} params
 * @param {string} params.userId - Supabase user ID
 * @param {string} params.winnerId - Winner item ID
 * @param {string} params.loserId - Loser item ID
 * @param {string|null} params.campaignId - Campaign ID if campaign vote
 * @param {number} params.qualityScore - Quality score 0-1
 * @param {number} params.timeTakenMs - Time taken in ms
 * @param {string} params.sessionId - Session identifier
 * @returns {Promise<{earned: boolean, amount: number}>}
 */
export async function submitVote({
  userId,
  winnerId,
  loserId,
  campaignId,
  qualityScore,
  timeTakenMs,
  sessionId,
}) {
  if (!supabase) return { earned: false, amount: 0 };

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
          const amount = Number(campaign.payout_per_vote);

          // Use atomic increment to avoid race condition
          await supabase.rpc("increment_campaign_spent", {
            p_campaign_id: campaignId,
            p_amount: amount,
          }).catch(() => {
            // Last resort: direct update (still has race window but better than nothing)
            supabase
              .from("campaigns")
              .update({ spent_usdc: campaign.spent_usdc + amount })
              .eq("id", campaignId)
              .lte("spent_usdc", campaign.budget_usdc - amount);
          });

          return { earned: true, amount };
        }
      } else if (result && result.amount > 0) {
        return { earned: true, amount: result.amount };
      }
    }

    return { earned: false, amount: 0 };
  } catch {
    return { earned: false, amount: 0 };
  }
}
