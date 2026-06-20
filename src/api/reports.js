/**
 * Generate campaign report JSON.
 * Item win rates, matchup counts, quality-filtered aggregates,
 * and cross-category correlation signals.
 */
import { supabase } from "./supabase";

/**
 * Generate a full report for a campaign.
 * @param {string} campaignId
 * @returns {Promise<Object>} Report data
 */
export async function generateCampaignReport(campaignId) {
  if (!supabase) return null;

  // Fetch campaign
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (!campaign) return null;

  // Fetch all votes for this campaign
  const { data: votes } = await supabase
    .from("votes")
    .select("winner_id, loser_id, quality_score, source, time_taken_ms")
    .eq("campaign_id", campaignId);

  // Fetch campaign items
  const { data: campaignItems } = await supabase
    .from("campaign_items")
    .select("item_id")
    .eq("campaign_id", campaignId);

  const itemIds = (campaignItems ?? []).map((ci) => ci.item_id);

  // Fetch item details
  const { data: items } = await supabase
    .from("items")
    .select("id, name, cat, rating")
    .in("id", itemIds);

  // Calculate stats
  const allVotes = votes ?? [];
  const qualityVotes = allVotes.filter((v) => v.quality_score >= 0.6);
  const humanVotes = allVotes.filter((v) => v.source === "human");
  const agentVotes = allVotes.filter((v) => v.source === "agent");

  // Win rates per item
  const itemStats = {};
  for (const id of itemIds) {
    itemStats[id] = { wins: 0, losses: 0, matchups: 0 };
  }

  for (const vote of qualityVotes) {
    if (itemStats[vote.winner_id]) {
      itemStats[vote.winner_id].wins++;
      itemStats[vote.winner_id].matchups++;
    }
    if (itemStats[vote.loser_id]) {
      itemStats[vote.loser_id].losses++;
      itemStats[vote.loser_id].matchups++;
    }
  }

  // Add win rates
  for (const id of itemIds) {
    const s = itemStats[id];
    s.winRate = s.matchups > 0 ? (s.wins / s.matchups).toFixed(3) : "0.000";
    const item = (items ?? []).find((i) => i.id === id);
    if (item) {
      s.name = item.name;
      s.cat = item.cat;
      s.rating = item.rating;
    }
  }

  // Cross-category signals
  const catMap = {};
  for (const item of items ?? []) {
    catMap[item.id] = item.cat;
  }

  const crossCat = {};
  for (const vote of qualityVotes) {
    const wCat = catMap[vote.winner_id];
    const lCat = catMap[vote.loser_id];
    if (wCat && lCat && wCat !== lCat) {
      const key = `${wCat}>${lCat}`;
      crossCat[key] = (crossCat[key] || 0) + 1;
    }
  }

  return {
    campaign: {
      id: campaign.id,
      brand_name: campaign.brand_name,
      title: campaign.title,
      status: campaign.status,
      budget_usdc: campaign.budget_usdc,
      spent_usdc: campaign.spent_usdc,
    },
    totals: {
      total_votes: allVotes.length,
      quality_votes: qualityVotes.length,
      human_votes: humanVotes.length,
      agent_votes: agentVotes.length,
      avg_quality: allVotes.length
        ? (allVotes.reduce((s, v) => s + Number(v.quality_score), 0) / allVotes.length).toFixed(3)
        : "0.000",
    },
    item_stats: itemStats,
    cross_category_signals: crossCat,
  };
}
