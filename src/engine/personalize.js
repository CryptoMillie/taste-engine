/**
 * Personalized pairing — learns from votes to curate matchups
 * around the user's taste while keeping discovery and chaos intact.
 * Now with AI-powered pair suggestions via Chutes inference.
 */

import { suggestPair } from "../api/chutes";
import { getCategoryStats, getArchetype, getTopAndRarest } from "./taste-profile";

const RECENCY_LIMIT = 20;
const MIN_CATEGORIES_FOR_PERSONALIZATION = 3;
const FLOOR_WEIGHT = 0.1;

// --- AI pair prefetch cache ---
let _aiCache = null;      // { a: itemName, b: itemName }
let _aiFetching = false;

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
 * Prefetch an AI-suggested pair in the background.
 * Call after each vote so the next AI pick is ready instantly.
 */
export function prefetchAIPair(items, prefs) {
  if (_aiFetching || !items.length) return;
  _aiFetching = true;

  const catStats = getCategoryStats(items);
  const cRate = 0; // approximate, not critical for suggestion
  const xRate = 0;
  const { topPick } = getTopAndRarest(items);

  const profile = {
    archetype: getArchetype(catStats, cRate, xRate),
    topPick: topPick?.name || null,
    categoryStats: Object.fromEntries(
      Object.entries(catStats).map(([cat, s]) => [cat, Math.round(s.winRate * 100) + "%"])
    ),
    recentNames: prefs.recentIds.slice(0, 10),
  };

  suggestPair(items, profile)
    .then((result) => {
      _aiCache = result;
    })
    .catch(() => {
      _aiCache = null;
    })
    .finally(() => {
      _aiFetching = false;
    });
}

/**
 * Try to resolve a cached AI suggestion into actual item objects.
 * Returns a pair or null if names don't match.
 */
function resolveAIPair(items, prefs) {
  if (!_aiCache) return null;

  const { a, b } = _aiCache;
  _aiCache = null; // consume it

  const pool = filterRecent(items, prefs.recentIds);
  const nameMap = new Map(pool.map((i) => [i.name.toLowerCase(), i]));

  const itemA = nameMap.get(a.toLowerCase());
  const itemB = nameMap.get(b.toLowerCase());

  if (itemA && itemB && itemA.id !== itemB.id) {
    return Math.random() < 0.5 ? [itemA, itemB] : [itemB, itemA];
  }
  return null;
}

/**
 * Master 4-tier picker:
 *  20% AI-suggested — inference-powered interesting matchup (if cached)
 *  12% chaos — cross-category wildcard
 *  30% personalized — affinity-weighted category pick
 *  38% discovery — existing coverage-first + Elo logic
 */
export function pickPairPersonalized(items, prefs) {
  if (items.length < 2) return items.slice(0, 2);

  const roll = Math.random();

  // 20% AI-suggested pair (if one is cached)
  if (roll < 0.20) {
    const aiPair = resolveAIPair(items, prefs);
    if (aiPair) return aiPair;
    // Fall through if no cached suggestion
  }

  // 12% chaos — cross-category wildcard
  if (roll < 0.32) {
    return pickChaos(items, prefs);
  }

  // 30% personalized (only if enough category data)
  const seenCats = Object.keys(prefs.catSeen);
  if (roll < 0.62 && seenCats.length >= MIN_CATEGORIES_FOR_PERSONALIZATION) {
    const result = pickPersonalizedPair(items, prefs);
    if (result) return result;
  }

  // 38% discovery (or fallback) — coverage-first + Elo-closest
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
