/**
 * Campaign-aware pair picker.
 * Wraps the existing pickPair() and injects campaign items at ~30% rate.
 */
import { pickPair } from "./store";

/**
 * Pick a pair, potentially injecting a campaign item.
 * @param {Array} items - All items
 * @param {Array} campaigns - Active campaigns with itemIds
 * @returns {{ pair: [Object, Object], campaignId: string|null }}
 */
export function pickPairWithCampaigns(items, campaigns) {
  // Find active campaign with items in our item set
  const activeCampaign = campaigns.find((c) => {
    const rate = Number(c.injection_rate) || 0.3;
    return c.itemIds?.length > 0 && Math.random() < rate;
  });

  if (activeCampaign) {
    // Pick a campaign item
    const campaignItems = items.filter((it) =>
      activeCampaign.itemIds.includes(it.id)
    );

    if (campaignItems.length > 0) {
      const campaignItem = campaignItems[(Math.random() * campaignItems.length) | 0];

      // Pick a non-campaign item as opponent
      const opponents = items.filter(
        (it) => !activeCampaign.itemIds.includes(it.id) && it.id !== campaignItem.id
      );

      if (opponents.length > 0) {
        const opponent = opponents[(Math.random() * opponents.length) | 0];
        const pair = Math.random() < 0.5
          ? [campaignItem, opponent]
          : [opponent, campaignItem];
        return { pair, campaignId: activeCampaign.id };
      }
    }
  }

  // Fall back to regular pairing
  return { pair: pickPair(items), campaignId: null };
}
