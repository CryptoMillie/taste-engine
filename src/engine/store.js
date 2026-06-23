/**
 * Elo-based ranking store with localStorage persistence.
 */
import { SEED_ITEMS } from "../data/seeds";
import { emptyPrefs, updatePrefs } from "./personalize";

const STORAGE_KEY = "taste-engine-state";
const STREAK_KEY = "taste-engine-streak";
const BASE = 1200;

const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
const kFactor = (n) => (n < 10 ? 40 : n < 30 ? 24 : 16);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items) || typeof parsed.votes !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(items, votes, contrarian, crossCat, prefs) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items, votes, contrarian, crossCat, prefs, savedAt: Date.now() })
    );
  } catch {
    // Storage full or unavailable — degrade silently
  }
}

export function createStore(initialItems) {
  const saved = loadState();

  let items = saved?.items ?? (initialItems || SEED_ITEMS).map((d, i) => ({
    ...d,
    id: d.id ?? "i" + i,
    rating: d.rating ?? BASE,
    comparisons: d.comparisons ?? 0,
    wins: d.wins ?? 0,
  }));

  let votes = saved?.votes ?? 0;
  let contrarian = saved?.contrarian ?? 0;
  let crossCat = saved?.crossCat ?? 0;
  let prefs = saved?.prefs ?? emptyPrefs();

  // Merge new items that don't exist yet (from trending/Wikidata)
  const mergeNewItems = (newItems) => {
    const existingIds = new Set(items.map((i) => i.id));
    const toAdd = newItems
      .filter((d) => !existingIds.has(d.id))
      .map((d) => ({
        ...d,
        id: d.id ?? "i" + items.length,
        rating: d.rating ?? BASE,
        comparisons: d.comparisons ?? 0,
        wins: d.wins ?? 0,
      }));
    if (toAdd.length > 0) {
      items = [...items, ...toAdd];
      saveState(items, votes, contrarian, crossCat, prefs);
    }
  };

  return {
    getItems: () => items,
    getVotes: () => votes,
    getContrarian: () => contrarian,
    getCrossCat: () => crossCat,
    getPrefs: () => prefs,
    incrementCrossCat: () => {
      crossCat += 1;
      saveState(items, votes, contrarian, crossCat, prefs);
    },
    mergeNewItems,

    vote: (wId, lId) => {
      const w = items.find((i) => i.id === wId);
      const l = items.find((i) => i.id === lId);
      const ew = expected(w.rating, l.rating);
      const k = kFactor(Math.min(w.comparisons, l.comparisons));
      const delta = Math.round(k * (1 - ew));
      const upset = w.rating < l.rating;

      items = items.map((i) =>
        i.id === wId
          ? { ...i, rating: i.rating + delta, comparisons: i.comparisons + 1, wins: i.wins + 1 }
          : i.id === lId
            ? { ...i, rating: i.rating - delta, comparisons: i.comparisons + 1 }
            : i
      );

      votes += 1;
      if (upset) contrarian += 1;
      prefs = updatePrefs(prefs, w, l);

      saveState(items, votes, contrarian, crossCat, prefs);

      return { delta, upset };
    },

    reset: () => {
      items = (initialItems || SEED_ITEMS).map((d, i) => ({
        ...d,
        id: d.id ?? "i" + i,
        rating: BASE,
        comparisons: 0,
        wins: 0,
      }));
      votes = 0;
      contrarian = 0;
      crossCat = 0;
      prefs = emptyPrefs();
      localStorage.removeItem(STORAGE_KEY);
    },
  };
}

/** Streak tracking — separate from main state so resets don't kill streaks. */
export function getStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { current: 0, best: 0, lastVoteDate: null };
    return JSON.parse(raw);
  } catch {
    return { current: 0, best: 0, lastVoteDate: null };
  }
}

export function updateStreak() {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const streak = getStreak();

  if (streak.lastVoteDate === today) {
    // Already voted today — no change
    return { ...streak, isNew: false };
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let next;

  if (streak.lastVoteDate === yesterday) {
    // Consecutive day — increment
    next = streak.current + 1;
  } else {
    // Streak broken (or first vote ever) — start at 1
    next = 1;
  }

  const best = Math.max(next, streak.best);
  const updated = { current: next, best, lastVoteDate: today };

  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(updated));
  } catch { /* storage full */ }

  return { ...updated, isNew: true };
}

export function pickPair(items) {
  const c = (i) => i.comparisons;
  const byCov = [...items].sort((a, b) => c(a) - c(b));
  const aPool = byCov.slice(0, Math.max(3, Math.ceil(items.length * 0.4)));
  const a = aPool[(Math.random() * aPool.length) | 0];

  // 14% chaos: cross-category wildcard
  if (Math.random() < 0.14) {
    const others = items.filter((i) => i.id !== a.id && i.cat !== a.cat);
    if (others.length) {
      const w = others[(Math.random() * others.length) | 0];
      return Math.random() < 0.5 ? [a, w] : [w, a];
    }
  }

  const rivals = items
    .filter((i) => i.id !== a.id)
    .sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating));
  const bPool = rivals.slice(0, Math.max(2, Math.ceil(rivals.length * 0.3)));
  const b = bPool[(Math.random() * bPool.length) | 0];
  return Math.random() < 0.5 ? [a, b] : [b, a];
}
