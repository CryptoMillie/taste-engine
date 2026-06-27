import { useState, useEffect, useCallback } from "react";
import { fetchCoinBalance } from "../api/coins";

/**
 * Hook for Taste Coins state.
 * Provides balance, lifetimeEarned, refresh(), and addOptimistic().
 */
export function useCoins(userId) {
  const [balance, setBalance] = useState(0);
  const [lifetimeEarned, setLifetimeEarned] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const data = await fetchCoinBalance(userId);
    setBalance(data.balance);
    setLifetimeEarned(data.lifetimeEarned);
  }, [userId]);

  // Optimistically adjust balance (e.g., after earning or staking)
  const addOptimistic = useCallback((amount) => {
    setBalance((b) => Math.max(0, b + amount));
    if (amount > 0) {
      setLifetimeEarned((le) => le + amount);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, lifetimeEarned, refresh, addOptimistic };
}
