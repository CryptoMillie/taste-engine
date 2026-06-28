/**
 * Chutes AI inference client — taste intelligence via DeepSeek.
 * Dual-path: tries the compute network first, falls back to Chutes API.
 */

import { networkInfer } from "./compute-inference";

const CHUTES_URL = "https://chutes-deepseek-ai-deepseek-v3-2-tee.chutes.ai/v1/chat/completions";
const CHUTES_KEY = import.meta.env.VITE_CHUTES_API_KEY;
const MODEL = "deepseek-ai/DeepSeek-V3.2-TEE";

/**
 * Call Chutes API directly (fallback path).
 */
async function chutesInfer(systemPrompt, userPrompt) {
  if (!CHUTES_KEY) return null;

  try {
    const res = await fetch(CHUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHUTES_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Dual-path inference: try compute network first, fall back to Chutes API.
 * Returns parsed JSON or raw text.
 */
async function infer(systemPrompt, userPrompt, jsonMode = true) {
  // Try network first (self-consuming path)
  let content = await networkInfer(systemPrompt, userPrompt).catch(() => null);

  // Fall back to Chutes API
  if (!content) {
    content = await chutesInfer(systemPrompt, userPrompt);
  }

  if (!content) return null;

  if (jsonMode) {
    const jsonMatch = content.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }

  return content;
}

/**
 * Suggest an interesting pair from the item pool based on user taste.
 * Returns [itemNameA, itemNameB] or null.
 *
 * @param {Array} items - All items in the pool
 * @param {Object} profile - { archetype, topPick, categoryStats, recentNames }
 * @returns {Promise<{a: string, b: string}|null>}
 */
export async function suggestPair(items, profile) {
  const itemNames = items.map((i) => `${i.name} (${i.cat})`);

  // Send a compact subset to keep tokens low
  const sample = itemNames.length > 60
    ? itemNames.sort(() => Math.random() - 0.5).slice(0, 60)
    : itemNames;

  const system = `You are a taste engine that creates interesting matchups. Pick two items that would create the most divisive, surprising, or revealing comparison for this user. The pair should teach us something new about their taste — avoid obvious or boring matchups.`;

  const user = `User profile:
- Archetype: ${profile.archetype || "Unknown"}
- Top pick: ${profile.topPick || "None yet"}
- Category engagement: ${JSON.stringify(profile.categoryStats || {})}
- Recently seen: ${(profile.recentNames || []).slice(0, 10).join(", ")}

Available items:
${sample.join(", ")}

Return JSON: {"a": "exact item name", "b": "exact item name"}`;

  const result = await infer(system, user);
  if (!result || !result.a || !result.b) return null;
  return { a: result.a, b: result.b };
}

/**
 * Infer taste insights from voting history.
 * Returns a taste summary object.
 *
 * @param {Array} items - Items with ratings/wins/comparisons
 * @param {Object} profile - { archetype, categoryStats, votes, contrarianRate }
 * @returns {Promise<Object|null>} { summary, predictions, blindSpots, suggestedCategories }
 */
export async function inferTaste(items, profile) {
  const topItems = [...items]
    .filter((i) => i.comparisons >= 2)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 15)
    .map((i) => `${i.name} (${i.cat}, rating: ${i.rating}, wins: ${i.wins}/${i.comparisons})`);

  const system = `You are a taste analyst. Given a user's voting patterns, provide concise insights about their preferences.`;

  const user = `User profile:
- Archetype: ${profile.archetype}
- Votes: ${profile.votes}
- Contrarian rate: ${(profile.contrarianRate * 100).toFixed(0)}%
- Category stats: ${JSON.stringify(profile.categoryStats)}

Top rated items:
${topItems.join("\n")}

Return JSON:
{
  "summary": "one sentence taste summary",
  "predictions": ["3 things they'd probably like"],
  "blindSpots": ["2 categories or types they haven't explored"],
  "suggestedCategories": ["2 new category ideas that would interest them"]
}`;

  return await infer(system, user);
}

/**
 * Suggest new items to add to a category.
 * Returns array of {name, desc} or null.
 *
 * @param {string} category - Category to expand
 * @param {Array<string>} existingNames - Names already in pool
 * @returns {Promise<Array<{name, desc}>|null>}
 */
export async function expandCategory(category, existingNames) {
  const system = `You suggest trending, interesting entities for a taste/preference ranking app. Only suggest real, well-known entities that people would have opinions about.`;

  const user = `Category: ${category}
Already in pool: ${existingNames.slice(0, 20).join(", ")}

Suggest 8 new ${category} items NOT in the list above. Pick things that are currently relevant, popular, or conversation-worthy.

Return JSON array: [{"name": "exact name", "desc": "2-4 word description"}]`;

  return await infer(system, user);
}
