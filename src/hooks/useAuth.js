import { useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabase";

/**
 * Supabase auth: anonymous auto-login, social upgrade (Google/Twitter),
 * wallet connect, and cross-device state sync.
 */
export function useAuth() {
  const [userId, setUserId] = useState(null);
  const [authProvider, setAuthProvider] = useState("anonymous");
  const [userMeta, setUserMeta] = useState({
    displayName: null,
    email: null,
    avatarUrl: null,
  });
  const [walletAddress, setWalletAddress] = useState(
    () => localStorage.getItem("taste-wallet") || null
  );
  const [loading, setLoading] = useState(true);

  // Sync taste state to server (debounced by caller)
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
        // Server is newer — restore
        for (const [key, val] of Object.entries(data.taste_state)) {
          localStorage.setItem(key, val);
        }
        localStorage.setItem("taste-state-saved-at", String(serverTime));
      }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const extractMeta = (user) => {
      const meta = user.user_metadata || {};
      const provider = user.app_metadata?.provider || (user.is_anonymous ? "anonymous" : "email");
      setAuthProvider(provider);
      setUserMeta({
        displayName: meta.full_name || meta.name || meta.preferred_username || null,
        email: user.email || meta.email || null,
        avatarUrl: meta.avatar_url || meta.picture || null,
      });
      return { provider, meta };
    };

    const ensureUserRow = async (uid, provider, meta) => {
      try {
        await supabase.from("users").upsert({
          id: uid,
          wallet_address: walletAddress,
          auth_provider: provider,
          display_name: meta.full_name || meta.name || meta.preferred_username || null,
          avatar_url: meta.avatar_url || meta.picture || null,
          email: meta.email || null,
        }, { onConflict: "id" });
      } catch { /* non-critical */ }
    };

    // Check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        const { provider, meta } = extractMeta(session.user);
        await ensureUserRow(session.user.id, provider, meta);
        if (provider !== "anonymous") {
          await loadStateFromServer(session.user.id);
        }
      } else {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (!error && data?.user) {
          setUserId(data.user.id);
          extractMeta(data.user);
          await ensureUserRow(data.user.id, "anonymous", {});
        }
      }
      setLoading(false);
    });

    // Listen for auth changes (social upgrade, sign-out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const uid = session?.user?.id ?? null;
        setUserId(uid);
        if (session?.user) {
          const { provider, meta } = extractMeta(session.user);
          await ensureUserRow(uid, provider, meta);
          if (provider !== "anonymous") {
            await loadStateFromServer(uid);
          }
        } else {
          setAuthProvider("anonymous");
          setUserMeta({ displayName: null, email: null, avatarUrl: null });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Background sync: push state to server every 30s when logged in
  useEffect(() => {
    if (!userId || authProvider === "anonymous") return;

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
  }, [userId, authProvider, syncStateToServer]);

  // ── Social login methods ──

  const signInWithGoogle = async () => {
    if (!supabase) return;
    try {
      // If anonymous, link identity to preserve session; otherwise fresh OAuth
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.is_anonymous) {
        await supabase.auth.linkIdentity({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
      } else {
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
      }
    } catch (err) {
      console.error("Google sign-in failed:", err);
    }
  };

  const signInWithTwitter = async () => {
    if (!supabase) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.is_anonymous) {
        await supabase.auth.linkIdentity({
          provider: "twitter",
          options: { redirectTo: window.location.origin },
        });
      } else {
        await supabase.auth.signInWithOAuth({
          provider: "twitter",
          options: { redirectTo: window.location.origin },
        });
      }
    } catch (err) {
      console.error("Twitter sign-in failed:", err);
    }
  };

  const upgradeAnonymous = async (provider) => {
    if (!supabase) return;
    await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // Re-sign in anonymously
    const { data } = await supabase.auth.signInAnonymously();
    if (data?.user) {
      setUserId(data.user.id);
      setAuthProvider("anonymous");
    }
  };

  // ── Wallet methods ──

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
    loading,
    signInWithGoogle,
    signInWithTwitter,
    upgradeAnonymous,
    signOut,
    connectWallet,
    connectMetaMask,
    connectPhantom,
  };
}
