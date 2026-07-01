import { useState, useEffect, useCallback } from "react";
import { useUser, useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { supabase } from "../api/supabase";

/**
 * Auth hook powered by Clerk. Replaces Supabase auth while keeping
 * the same return shape so the rest of the app works unchanged.
 * Supabase is still used for data (votes, stakes, etc.) but no longer for auth.
 */
export function useAuth() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut: clerkSignOut } = useClerkAuth();
  const clerk = useClerk();

  const [walletAddress, setWalletAddress] = useState(
    () => localStorage.getItem("taste-wallet") || null
  );

  // Derive userId from Clerk
  const userId = user?.id ?? null;

  // Derive auth provider
  const authProvider = !isLoaded
    ? "loading"
    : !isSignedIn
      ? "anonymous"
      : user?.primaryEmailAddress
        ? (user.externalAccounts?.[0]?.provider || "email")
        : "clerk";

  // Derive user metadata
  const userMeta = {
    displayName: user?.fullName || user?.firstName || null,
    email: user?.primaryEmailAddress?.emailAddress || null,
    avatarUrl: user?.imageUrl || null,
  };

  // Sync Clerk user to Supabase users table for data features
  const ensureUserRow = useCallback(async (uid) => {
    if (!supabase || !uid || !user) return;
    try {
      await supabase.from("users").upsert({
        id: uid,
        wallet_address: walletAddress,
        auth_provider: authProvider,
        display_name: user.fullName || user.firstName || null,
        avatar_url: user.imageUrl || null,
        email: user.primaryEmailAddress?.emailAddress || null,
      }, { onConflict: "id" });
    } catch { /* non-critical */ }
  }, [user, walletAddress, authProvider]);

  // Sync taste state to server
  const syncStateToServer = useCallback(async (uid) => {
    if (!supabase || !uid) return;
    try {
      const stateKeys = ["taste-store", "taste-polls-voted", "taste-streak"];
      const state = {};
      for (const key of stateKeys) {
        const val = localStorage.getItem(key);
        if (val) state[key] = val;
      }
      await supabase.from("users").update({
        taste_state: state,
        taste_state_updated_at: new Date().toISOString(),
      }).eq("id", uid);
    } catch { /* non-critical */ }
  }, []);

  // Load state from server if newer
  const loadStateFromServer = useCallback(async (uid) => {
    if (!supabase || !uid) return;
    try {
      const { data } = await supabase
        .from("users")
        .select("taste_state, taste_state_updated_at")
        .eq("id", uid)
        .single();
      if (!data?.taste_state) return;

      const serverTime = data.taste_state_updated_at
        ? new Date(data.taste_state_updated_at).getTime()
        : 0;
      const localSavedAt = Number(localStorage.getItem("taste-state-saved-at") || "0");

      if (serverTime > localSavedAt) {
        for (const [key, val] of Object.entries(data.taste_state)) {
          localStorage.setItem(key, val);
        }
        localStorage.setItem("taste-state-saved-at", String(serverTime));
      }
    } catch { /* non-critical */ }
  }, []);

  // When signed in, sync user row and load state from server
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    ensureUserRow(userId);
    loadStateFromServer(userId);
  }, [isLoaded, isSignedIn, userId, ensureUserRow, loadStateFromServer]);

  // Background sync: push state to server every 30s when logged in
  useEffect(() => {
    if (!userId || !isSignedIn) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        localStorage.setItem("taste-state-saved-at", String(Date.now()));
        syncStateToServer(userId);
      }
    }, 30000);

    const handleUnload = () => {
      localStorage.setItem("taste-state-saved-at", String(Date.now()));
      syncStateToServer(userId);
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [userId, isSignedIn, syncStateToServer]);

  // ── Sign-in: open Clerk's sign-in modal ──
  const signIn = () => {
    clerk.openSignIn();
  };

  // ── Sign-out ──
  const signOut = async () => {
    await clerkSignOut();
  };

  // ── Wallet methods (unchanged) ──
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

  return {
    userId,
    authProvider,
    userMeta,
    walletAddress,
    loading: !isLoaded,
    isSignedIn: !!isSignedIn,
    signIn,
    signInWithTwitter: signIn, // kept for backward compat — opens Clerk modal
    signOut,
    connectWallet,
    connectMetaMask,
    connectPhantom,
  };
}
