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
      // Fetch campaign payout rate
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("payout_per_vote, budget_usdc, spent_usdc")
        .eq("id", campaignId)
        .single();

      if (campaign && campaign.spent_usdc + campaign.payout_per_vote <= campaign.budget_usdc) {
        const amount = Number(campaign.payout_per_vote);

        // Update campaign spent
        await supabase
          .from("campaigns")
          .update({ spent_usdc: campaign.spent_usdc + amount })
          .eq("id", campaignId);

        // Update user earnings
        if (userId) {
          await supabase.rpc("increment_earnings", {
            p_user_id: userId,
            p_amount: amount,
          }).catch(() => {
            // Fallback: direct update
            supabase
              .from("users")
              .update({
                total_earned_usdc: campaign.spent_usdc + amount, // Will be handled by RPC ideally
                vote_count: 0, // Placeholder
              })
              .eq("id", userId);
          });
        }

        return { earned: true, amount };
      }
    }

    return { earned: false, amount: 0 };
  } catch {
    return { earned: false, amount: 0 };
  }
}
