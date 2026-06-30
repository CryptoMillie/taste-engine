import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { supabase } from "../api/supabase";
import { useAuth } from "../hooks/useAuth";
import { fetchCoinHistory } from "../api/coins";
import { fetchRlhfStats, toggleRlhfOptIn } from "../api/reputation";
import ApiKeys from "./ApiKeys";

function ApiKeysSection({ userId }) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
  }, []);

  if (!session) return null;
  return <ApiKeys userId={userId} session={session} />;
}

export default function Profile({
  userId,
  votes,
  coinBalance = 0,
  coinLifetime = 0,
  authProvider = "anonymous",
  userMeta = {},
  onSignInGoogle,
  onSignInTwitter,
  onSignOut,
  computeStats = null,
  reputation = 1.0,
  repDetails = {},
}) {
  const { walletAddress, connectWallet, connectMetaMask, connectPhantom } = useAuth();
  const [earnings, setEarnings] = useState(0);
  const [walletInput, setWalletInput] = useState("");
  const [payoutRequested, setPayoutRequested] = useState(false);
  const [qualityStats, setQualityStats] = useState(null);
  const [recentStakes, setRecentStakes] = useState([]);
  const [coinHistory, setCoinHistory] = useState([]);
  const [rlhfStats, setRlhfStats] = useState({ highQualityVotes: 0, dividendsEarned: 0, optedIn: true });

  useEffect(() => {
    if (!supabase || !userId) return;

    supabase
      .from("users")
      .select("total_earned_usdc, vote_count")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data) setEarnings(Number(data.total_earned_usdc) || 0);
      });

    supabase
      .from("votes")
      .select("quality_score")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data?.length) {
          const scores = data.map((v) => Number(v.quality_score));
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          const qualifying = scores.filter((s) => s >= 0.6).length;
          setQualityStats({ avgScore: avg.toFixed(3), qualifying, total: scores.length });
        }
      });

    // Fetch recent stakes
    supabase
      .from("stakes")
      .select("id, predicted_winner, amount, payout, status, created_at, market_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setRecentStakes(data);
      })
      .catch(() => {});

    // Fetch coin history
    fetchCoinHistory(userId, 10).then(setCoinHistory);

    // Fetch RLHF stats
    fetchRlhfStats(userId).then(setRlhfStats);
  }, [userId]);

  const handleRequestPayout = async () => {
    if (!supabase || !userId || earnings < 1 || !walletAddress) return;
    const { error } = await supabase.from("payouts").insert({
      user_id: userId,
      amount_usdc: earnings,
      status: "pending",
    });
    if (!error) setPayoutRequested(true);
  };

  const handlePasteWallet = () => {
    if (walletInput.trim().length >= 26) {
      connectWallet(walletInput.trim());
      setWalletInput("");
    }
  };

  const sectionStyle = {
    background: T.card,
    border: `1px solid ${T.line}`,
    borderRadius: 18,
    padding: "20px 24px",
    marginBottom: 16,
  };

  const isAnonymous = authProvider === "anonymous";

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 22px 52px" }}>
      <h2
        className="disp"
        style={{ fontSize: 36, fontWeight: 800, marginBottom: 24 }}
      >
        Your Profile
      </h2>

      {/* Account */}
      <div style={sectionStyle}>
        <div
          className="mono"
          style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
        >
          ACCOUNT
        </div>
        {isAnonymous ? (
          <div>
            <div style={{ fontSize: 14, color: T.soft, marginBottom: 12 }}>
              Sign in to sync your taste across devices
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {onSignInGoogle && (
                <button
                  onClick={onSignInGoogle}
                  style={{
                    flex: 1,
                    background: "#4285f4",
                    color: "#fff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Google
                </button>
              )}
              {onSignInTwitter && (
                <button
                  onClick={onSignInTwitter}
                  style={{
                    flex: 1,
                    background: "#000",
                    color: "#fff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  X / Twitter
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {userMeta.avatarUrl && (
              <img
                src={userMeta.avatarUrl}
                alt=""
                style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
              />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {userMeta.displayName || userMeta.email || "Signed in"}
              </div>
              <div style={{ fontSize: 12, color: T.soft }}>
                via {authProvider}
              </div>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                style={{
                  background: "transparent",
                  border: `1px solid ${T.line}`,
                  padding: "6px 14px",
                  borderRadius: 10,
                  fontSize: 12,
                  cursor: "pointer",
                  color: T.soft,
                }}
              >
                Sign out
              </button>
            )}
          </div>
        )}
      </div>

      {/* Taste Coins */}
      <div style={sectionStyle}>
        <div
          className="mono"
          style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 6 }}
        >
          TASTE COINS
        </div>
        <div style={{ display: "flex", gap: 24, marginBottom: coinHistory.length ? 12 : 0 }}>
          <div>
            <div className="disp" style={{ fontSize: 36, fontWeight: 800, color: "#d97706" }}>
              {coinBalance}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Balance</div>
          </div>
          <div>
            <div className="disp" style={{ fontSize: 36, fontWeight: 800, color: T.ink }}>
              {coinLifetime}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Lifetime earned</div>
          </div>
        </div>
        {coinHistory.length > 0 && (
          <div>
            <div
              className="mono"
              style={{ fontSize: 9, color: T.soft, letterSpacing: "0.12em", marginBottom: 6 }}
            >
              RECENT
            </div>
            {coinHistory.slice(0, 5).map((tx, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  padding: "4px 0",
                  borderBottom: i < 4 ? `1px solid ${T.line}` : "none",
                }}
              >
                <span style={{ color: T.soft }}>{tx.reason}</span>
                <span style={{ fontWeight: 600, color: tx.amount > 0 ? "#16a34a" : T.pop }}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Taste Reputation */}
      <div style={sectionStyle}>
        <div
          className="mono"
          style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 6 }}
        >
          TASTE REPUTATION
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
          <div className="disp" style={{ fontSize: 42, fontWeight: 800, color: "#7c3aed" }}>
            {reputation.toFixed(1)}x
          </div>
          <div style={{ fontSize: 13, color: T.soft }}>earning multiplier</div>
        </div>
        <div style={{ fontSize: 13, color: T.soft, marginBottom: 10 }}>
          {repDetails.highQualityVotes || 0}/{repDetails.totalRecentVotes || 0} high-quality (last 50)
        </div>
        {/* Progress bar: 0% at 1.0x, 100% at 3.0x */}
        <div style={{
          width: "100%", height: 8, background: T.line,
          borderRadius: 4, overflow: "hidden", marginBottom: 10,
        }}>
          <div style={{
            width: `${Math.min(100, ((reputation - 1.0) / 2.0) * 100)}%`,
            height: "100%",
            background: "#7c3aed",
            borderRadius: 4,
            transition: "width 0.3s ease",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.soft }}>
          <span>1.0x</span>
          <span>2.0x</span>
          <span>3.0x</span>
        </div>
        <div style={{
          fontSize: 12, color: T.soft, marginTop: 10,
          padding: "8px 10px", background: T.paper, borderRadius: 8,
        }}>
          Reputation decays if inactive for 3+ days. Keep voting to maintain your multiplier.
        </div>
      </div>

      {/* RLHF Data Contributions */}
      <div style={sectionStyle}>
        <div
          className="mono"
          style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
        >
          RLHF DATA CONTRIBUTIONS
        </div>
        <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
          <div>
            <div className="disp" style={{ fontSize: 28, fontWeight: 700, color: "#7c3aed" }}>
              {rlhfStats.highQualityVotes}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Preference pairs</div>
          </div>
          <div>
            <div className="disp" style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>
              ${rlhfStats.dividendsEarned.toFixed(4)}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Data dividends</div>
          </div>
        </div>
        {/* Quality tier badge */}
        <div style={{ marginBottom: 12 }}>
          {(() => {
            const v = rlhfStats.highQualityVotes;
            const tier = v >= 100 ? { label: "GOLD", color: "#d97706", bg: "#fef3c7" }
              : v >= 25 ? { label: "SILVER", color: "#6b7280", bg: "#f3f4f6" }
              : { label: "BRONZE", color: "#92400e", bg: "#fef3c7" };
            return (
              <span className="mono" style={{
                fontSize: 10, fontWeight: 700, color: tier.color,
                background: tier.bg, padding: "3px 10px", borderRadius: 6,
                letterSpacing: "0.08em",
              }}>
                {tier.label} CONTRIBUTOR
              </span>
            );
          })()}
        </div>
        {/* Opt-in/out toggle */}
        <button
          onClick={() => {
            const newVal = !rlhfStats.optedIn;
            setRlhfStats((s) => ({ ...s, optedIn: newVal }));
            toggleRlhfOptIn(userId, newVal);
          }}
          style={{
            background: rlhfStats.optedIn ? "#7c3aed" : T.line,
            color: rlhfStats.optedIn ? "#fff" : T.soft,
            border: "none",
            padding: "10px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            width: "100%",
          }}
        >
          {rlhfStats.optedIn ? "Opted In — Earning Data Dividends" : "Opted Out — Tap to Opt In"}
        </button>
        <div style={{ fontSize: 11, color: T.soft, marginTop: 8 }}>
          Your votes train AI models via RLHF. All data is anonymized.
        </div>
      </div>

      {/* Predictions */}
      {recentStakes.length > 0 && (
        <div style={sectionStyle}>
          <div
            className="mono"
            style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
          >
            PREDICTIONS
          </div>
          {recentStakes.map((s) => {
            const statusColors = {
              pending: T.soft,
              won: "#16a34a",
              lost: T.pop,
              refunded: "#d97706",
            };
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                  padding: "6px 0",
                  borderBottom: `1px solid ${T.line}`,
                }}
              >
                <span style={{ color: T.soft }}>{s.amount} coins staked</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: statusColors[s.status] || T.soft,
                    letterSpacing: "0.08em",
                  }}
                >
                  {s.status.toUpperCase()}
                  {s.status === "won" && ` +${s.payout}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* GPU Compute Earnings */}
      {computeStats && computeStats.total_jobs > 0 && (
        <div style={sectionStyle}>
          <div
            className="mono"
            style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
          >
            GPU COMPUTE EARNINGS
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div className="disp" style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>
                ${Number(computeStats.total_usdc_earned || 0).toFixed(4)}
              </div>
              <div style={{ fontSize: 12, color: T.soft }}>USDC earned</div>
            </div>
            <div>
              <div className="disp" style={{ fontSize: 28, fontWeight: 700, color: "#d97706" }}>
                {computeStats.total_coins_earned}
              </div>
              <div style={{ fontSize: 12, color: T.soft }}>Coins mined</div>
            </div>
            <div>
              <div className="disp" style={{ fontSize: 28, fontWeight: 700 }}>
                {computeStats.total_jobs}
              </div>
              <div style={{ fontSize: 12, color: T.soft }}>Jobs</div>
            </div>
          </div>
        </div>
      )}

      {/* API Keys */}
      {userId && supabase && (
        <ApiKeysSection userId={userId} />
      )}

      {/* Earnings */}
      <div style={sectionStyle}>
        <div
          className="mono"
          style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 6 }}
        >
          TOTAL EARNINGS
        </div>
        <div className="disp" style={{ fontSize: 42, fontWeight: 800, color: "#4ade80" }}>
          ${earnings.toFixed(2)}
        </div>
        <div style={{ fontSize: 14, color: T.soft, marginTop: 4 }}>
          USDC · {votes} votes cast
        </div>
      </div>

      {/* Quality Stats */}
      {qualityStats && (
        <div style={sectionStyle}>
          <div
            className="mono"
            style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
          >
            VOTE QUALITY
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div className="disp" style={{ fontSize: 28, fontWeight: 700 }}>
                {qualityStats.avgScore}
              </div>
              <div style={{ fontSize: 12, color: T.soft }}>Avg score</div>
            </div>
            <div>
              <div className="disp" style={{ fontSize: 28, fontWeight: 700 }}>
                {qualityStats.qualifying}/{qualityStats.total}
              </div>
              <div style={{ fontSize: 12, color: T.soft }}>Qualifying votes</div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet */}
      <div style={sectionStyle}>
        <div
          className="mono"
          style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
        >
          WALLET ADDRESS
        </div>
        {walletAddress ? (
          <div>
            <code
              style={{
                fontSize: 13,
                background: T.paper,
                padding: "6px 10px",
                borderRadius: 8,
                wordBreak: "break-all",
              }}
            >
              {walletAddress}
            </code>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={connectMetaMask}
                style={{
                  flex: 1,
                  background: T.ink,
                  color: T.paper,
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Connect MetaMask
              </button>
              <button
                onClick={connectPhantom}
                style={{
                  flex: 1,
                  background: "#ab9ff2",
                  color: "#fff",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Connect Phantom
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="Or paste wallet address..."
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: `1px solid ${T.line}`,
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <button
                onClick={handlePasteWallet}
                style={{
                  background: T.soft,
                  color: T.paper,
                  border: "none",
                  padding: "9px 14px",
                  borderRadius: 10,
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payout */}
      <div style={sectionStyle}>
        {earnings >= 1 && walletAddress && !payoutRequested && (
          <div style={{
            fontSize: 12, marginBottom: 12, padding: "10px 14px",
            background: T.paper, borderRadius: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: T.soft }}>Gross</span>
              <span>${earnings.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: T.soft }}>Fee (10%)</span>
              <span style={{ color: T.pop }}>-${(earnings * 0.10).toFixed(2)}</span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontWeight: 600, borderTop: `1px solid ${T.line}`, paddingTop: 3,
            }}>
              <span>You receive</span>
              <span style={{ color: "#16a34a" }}>${(earnings * 0.90).toFixed(2)} USDC</span>
            </div>
            <div style={{ fontSize: 11, color: T.soft, marginTop: 4 }}>
              Sent to your wallet on Base
            </div>
          </div>
        )}
        <button
          onClick={handleRequestPayout}
          disabled={earnings < 1 || !walletAddress || payoutRequested}
          style={{
            width: "100%",
            background: earnings >= 1 && walletAddress && !payoutRequested ? "#4ade80" : T.line,
            color: earnings >= 1 && walletAddress && !payoutRequested ? T.ink : T.soft,
            border: "none",
            padding: "14px 18px",
            borderRadius: 14,
            fontSize: 16,
            fontWeight: 700,
            cursor: earnings >= 1 && walletAddress && !payoutRequested ? "pointer" : "default",
          }}
        >
          {payoutRequested
            ? "Payout Requested — Processing on Base"
            : earnings < 1
              ? "Minimum $1.00 to withdraw"
              : !walletAddress
                ? "Connect wallet first"
                : `Withdraw $${(earnings * 0.90).toFixed(2)} USDC`}
        </button>
      </div>
    </main>
  );
}
