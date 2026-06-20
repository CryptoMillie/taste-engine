import { useState, useEffect } from "react";
import { fetchActiveCampaigns } from "../api/campaigns";

/**
 * Load active campaigns on mount.
 * Returns campaigns array and a loading state.
 */
export function useCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchActiveCampaigns().then((data) => {
      if (!cancelled) {
        setCampaigns(data);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, []);

  const refresh = () => {
    fetchActiveCampaigns().then(setCampaigns);
  };

  return { campaigns, loading, refresh };
}
