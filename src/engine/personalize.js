/**
 * Personalized pairing — learns from votes to curate matchups
 * around the user's taste while keeping discovery and chaos intact.
 */

const RECENCY_LIMIT = 20;
const MIN_CATEGORIES_FOR_PERSONALIZATION = 3;
const FLOOR_WEIGHT = 0.1;

export function emptyPrefs() {
  return { catWins: {}, catSeen: {}, recentIds: [] };
}

export function updatePrefs(prefs, winner, loser) {
  const catWins = { ...prefs.catWins };
  const catSeen = { ...prefs.catSeen };

  // Winner's category gets a win
  if (winner.cat) {
    catWins[winner.cat] = (catWins[winner.cat] || 0) + 1;
    catSeen[winner.cat] = (catSeen[winner.cat] || 0) + 1;
  }
  // Loser's category gets a seen (no win)
  if (loser.cat) {
    catSeen[loser.cat] = (catSeen[loser.cat] || 0) + 1;
  }

  // Maintain recency buffer
  const recentIds = [...prefs.recentIds, winner.id, loser.id].slice(-RECENCY_LIMIT);

  return { catWins, catSeen, recentIds };
}

/**
 * Master 3-tier picker:
 *  14% chaos — cross-category wildcard
 *  36% personalized — affinity-weighted category pick
 *  50% discovery — existing coverage-first + Elo logic
 */
export function pickPairPersonalized(items, prefs) {
  if (items.length < 2) return items.slice(0, 2);

  const roll = Math.random();

  // 14% chaos — cross-category wildcard
  if (roll < 0.14) {
    return pickChaos(items, prefs);
  }

  // 36% personalized (only if enough category data)
  const seenCats = Object.keys(prefs.catSeen);
  if (roll < 0.50 && seenCats.length >= MIN_CATEGORIES_FOR_PERSONALIZATION) {
    const result = pickPersonalizedPair(items, prefs);
    if (result) return result;
  }

  // 50% discovery (or fallback) — coverage-first + Elo-closest
  return pickDiscovery(items, prefs);
}

function filterRecent(items, recentIds) {
  if (!recentIds.length) return items;
  const recent = new Set(recentIds);
  const filtered = items.filter((i) => !recent.has(i.id));
  // If too many filtered out, return all items
  return filtered.length >= 2 ? filtered : items;
}

function pickChaos(items, prefs) {
  const pool = filterRecent(items, prefs.recentIds);
  const a = pool[(Math.random() * pool.length) | 0];
  const others = pool.filter((i) => i.id !== a.id && i.cat !== a.cat);
  if (others.length) {
    const b = others[(Math.random() * others.length) | 0];
    return Math.random() < 0.5 ? [a, b] : [b, a];
  }
  // Fallback: any different item
  const any = pool.filter((i) => i.id !== a.id);
  const b = any[(Math.random() * any.length) | 0];
  return Math.random() < 0.5 ? [a, b] : [b, a];
}

function pickPersonalizedPair(items, prefs) {
  const pool = filterRecent(items, prefs.recentIds);

  // Build affinity weights per category
  const cats = Object.keys(prefs.catSeen);
  const weights = cats.map((cat) => {
    const wins = prefs.catWins[cat] || 0;
    const seen = prefs.catSeen[cat] || 1;
    return Math.max(wins / seen, FLOOR_WEIGHT);
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  // Weighted random category pick
  let r = Math.random() * totalWeight;
  let chosenCat = cats[0];
  for (let i = 0; i < cats.length; i++) {
    r -= weights[i];
    if (r <= 0) { chosenCat = cats[i]; break; }
  }

  // Pick item A from chosen category
  const catItems = pool.filter((i) => i.cat === chosenCat);
  if (catItems.length === 0) return null;
  const a = catItems[(Math.random() * catItems.length) | 0];

  // Pick rival B by closest Elo from ANY category (cross-pollination)
  const rivals = pool
    .filter((i) => i.id !== a.id)
    .sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating));
  if (rivals.length === 0) return null;
  const bPool = rivals.slice(0, Math.max(2, Math.ceil(rivals.length * 0.3)));
  const b = bPool[(Math.random() * bPool.length) | 0];
  return Math.random() < 0.5 ? [a, b] : [b, a];
}

function pickDiscovery(items, prefs) {
  const pool = filterRecent(items, prefs.recentIds);
  const c = (i) => i.comparisons;
  const byCov = [...pool].sort((a, b) => c(a) - c(b));
  const aPool = byCov.slice(0, Math.max(3, Math.ceil(pool.length * 0.4)));
  const a = aPool[(Math.random() * aPool.length) | 0];

  const rivals = pool
    .filter((i) => i.id !== a.id)
    .sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating));
  const bPool = rivals.slice(0, Math.max(2, Math.ceil(rivals.length * 0.3)));
  const b = bPool[(Math.random() * bPool.length) | 0];
  return Math.random() < 0.5 ? [a, b] : [b, a];
}
