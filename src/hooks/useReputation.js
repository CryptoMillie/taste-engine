import { useState, useEffect, useCallback } from "react";
import { fetchReputation } from "../api/reputation";

/**
 * Hook for Taste Reputation state.
 * Provides reputation multiplier, details, and refresh().
 */
export function useReputation(userId) {
  const [reputation, setReputation] = useState(1.0);
  const [details, setDetails] = useState({
    totalRecentVotes: 0,
    highQualityVotes: 0,
    updatedAt: null,
  });

  const refresh = useCallback(async () => {
    if (!userId) return;
    const data = await fetchReputation(userId);
    setReputation(data.reputation);
    setDetails({
      totalRecentVotes: data.totalRecentVotes,
      highQualityVotes: data.highQualityVotes,
      updatedAt: data.updatedAt,
    });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { reputation, details, refresh };
}
