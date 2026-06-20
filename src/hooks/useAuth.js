import { useState, useEffect } from "react";
import { supabase } from "../api/supabase";

/**
 * Supabase anonymous auth + wallet connect.
 * Auto-signs in anonymously on mount.
 */
export function useAuth() {
  const [userId, setUserId] = useState(null);
  const [walletAddress, setWalletAddress] = useState(
    () => localStorage.getItem("taste-wallet") || null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Ensure user row exists in DB
    const ensureUserRow = async (uid) => {
      try {
        await supabase.from("users").upsert({
          id: uid,
          wallet_address: walletAddress,
        }, { onConflict: "id" });
      } catch {
        // Non-critical — user row creation failed
      }
    };

    // Check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        await ensureUserRow(session.user.id);
        setLoading(false);
      } else {
        // Sign in anonymously
        const { data, error } = await supabase.auth.signInAnonymously();
        if (!error && data?.user) {
          setUserId(data.user.id);
          await ensureUserRow(data.user.id);
        }
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user?.id ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connectWallet = async (address) => {
    setWalletAddress(address);
    localStorage.setItem("taste-wallet", address);
    if (supabase && userId) {
      await supabase
        .from("users")
        .update({ wallet_address: address })
        .eq("id", userId);
    }
  };

  const connectMetaMask = async () => {
    if (typeof window.ethereum === "undefined") return null;
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (accounts[0]) {
        await connectWallet(accounts[0]);
        return accounts[0];
      }
    } catch {
      return null;
    }
    return null;
  };

  const connectPhantom = async () => {
    const phantom = window.phantom?.solana ?? window.solana;
    if (!phantom?.isPhantom) return null;
    try {
      const resp = await phantom.connect();
      const address = resp.publicKey.toString();
      await connectWallet(address);
      return address;
    } catch {
      return null;
    }
  };

  return { userId, walletAddress, loading, connectWallet, connectMetaMask, connectPhantom };
}
