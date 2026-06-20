/**
 * Pure taste stats computation — no side effects, no network calls.
 */

/**
 * Group items by category, sum wins/comparisons per category.
 * @param {Array} items — store items with { cat, wins, comparisons }
 * @returns {Object} { [cat]: { wins, comparisons, winRate, pct } }
 */
export function getCategoryStats(items) {
  const cats = {};
  let totalComparisons = 0;

  for (const it of items) {
    if (!it.comparisons) continue;
    if (!cats[it.cat]) cats[it.cat] = { wins: 0, comparisons: 0 };
    cats[it.cat].wins += it.wins;
    cats[it.cat].comparisons += it.comparisons;
    totalComparisons += it.comparisons;
  }

  for (const cat of Object.keys(cats)) {
    const c = cats[cat];
    c.winRate = c.comparisons > 0 ? c.wins / c.comparisons : 0;
    c.pct = totalComparisons > 0 ? c.comparisons / totalComparisons : 0;
  }

  return cats;
}

/**
 * Normalize category win rates to 0-1 for radar chart.
 * Highest win rate = 1.0, others scaled proportionally.
 * @param {Object} catStats — output of getCategoryStats
 * @returns {Array} [{ cat, value }] sorted alphabetically
 */
export function getRadarData(catStats) {
  const entries = Object.entries(catStats);
  if (!entries.length) return [];

  const maxRate = Math.max(...entries.map(([, s]) => s.winRate), 0.01);

  return entries
    .map(([cat, s]) => ({ cat, value: s.winRate / maxRate }))
    .sort((a, b) => a.cat.localeCompare(b.cat));
}

/**
 * Determine taste archetype from voting patterns.
 * @param {Object} catStats — output of getCategoryStats
 * @param {number} contrarianRate — contrarian / votes
 * @param {number} crossCatRate — crossCat / votes
 * @returns {string} archetype label
 */
export function getArchetype(catStats, contrarianRate, crossCatRate) {
  if (crossCatRate > 0.30) return "The Chaos Agent";
  if (contrarianRate > 0.40) return "The Contrarian";

  const entries = Object.entries(catStats);
  // Specialist: any single category > 60% of comparisons
  for (const [, s] of entries) {
    if (s.pct > 0.60) return "The Specialist";
  }

  // Explorer: 4+ categories each 10-35% of comparisons
  const midRange = entries.filter(([, s]) => s.pct >= 0.10 && s.pct <= 0.35);
  if (midRange.length >= 4) return "The Explorer";

  return "The Crowd Surfer";
}

/**
 * Get top pick (highest rating, min 2 comparisons) and
 * rarest pick (highest win rate with fewest comparisons).
 * @param {Array} items — store items
 * @returns {{ topPick: object|null, rarestPick: object|null }}
 */
export function getTopAndRarest(items) {
  const qualified = items.filter((i) => i.comparisons >= 2);
  if (!qualified.length) return { topPick: null, rarestPick: null };

  const topPick = qualified.reduce((best, i) =>
    i.rating > best.rating ? i : best
  );

  // Rarest: highest win rate among items with fewest comparisons
  // Sort by win rate desc, then comparisons asc
  const byRarity = [...qualified].sort((a, b) => {
    const aRate = a.wins / a.comparisons;
    const bRate = b.wins / b.comparisons;
    if (bRate !== aRate) return bRate - aRate;
    return a.comparisons - b.comparisons;
  });

  // Pick the rarest that isn't the top pick
  const rarestPick =
    byRarity.find((i) => i.id !== topPick.id) || byRarity[0];

  return { topPick, rarestPick };
}
