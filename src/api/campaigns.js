/**
 * Campaign API — fetch active campaigns with their items.
 */
import { supabase } from "./supabase";

/**
 * Fetch all active campaigns with their associated items.
 * @returns {Promise<Array>} Active campaigns with items array
 */
export async function fetchActiveCampaigns() {
  if (!supabase) return [];

  try {
    const { data: campaigns, error } = await supabase
      .from("campaigns")
      .select(`
        *,
        campaign_items (
          item_id
        )
      `)
      .eq("status", "active")
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);

    if (error || !campaigns) return [];

    return campaigns.map((c) => ({
      ...c,
      itemIds: (c.campaign_items ?? []).map((ci) => ci.item_id),
    }));
  } catch {
    return [];
  }
}

/**
 * Create a new campaign.
 */
export async function createCampaign({ brandName, title, budgetUsdc, payoutPerVote, injectionRate, itemIds, endsAt }) {
  if (!supabase) return null;

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      brand_name: brandName,
      title,
      budget_usdc: budgetUsdc,
      payout_per_vote: payoutPerVote ?? 0.05,
      injection_rate: injectionRate ?? 0.30,
      ends_at: endsAt || null,
    })
    .select()
    .single();

  if (error || !campaign) return null;

  // Link items
  if (itemIds?.length) {
    await supabase.from("campaign_items").insert(
      itemIds.map((itemId) => ({ campaign_id: campaign.id, item_id: itemId }))
    );
  }

  return campaign;
}

/**
 * Update campaign status (pause/resume/complete).
 */
export async function updateCampaignStatus(campaignId, status) {
  if (!supabase) return false;
  const { error } = await supabase
    .from("campaigns")
    .update({ status })
    .eq("id", campaignId);
  return !error;
}
