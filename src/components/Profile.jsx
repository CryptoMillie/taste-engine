import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { supabase } from "../api/supabase";
import { useAuth } from "../hooks/useAuth";

export default function Profile({ userId, votes }) {
  const { walletAddress, connectWallet, connectMetaMask, connectPhantom } = useAuth();
  const [earnings, setEarnings] = useState(0);
  const [walletInput, setWalletInput] = useState("");
  const [payoutRequested, setPayoutRequested] = useState(false);
  const [qualityStats, setQualityStats] = useState(null);

  useEffect(() => {
    if (!supabase || !userId) return;

    // Fetch user earnings
    supabase
      .from("users")
      .select("total_earned_usdc, vote_count")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setEarnings(Number(data.total_earned_usdc) || 0);
        }
      });

    // Fetch quality stats
    supabase
      .from("votes")
      .select("quality_score")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data?.length) {
          const scores = data.map((v) => Number(v.quality_score));
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          const qualifying = scores.filter((s) => s >= 0.6).length;
          setQualityStats({
            avgScore: avg.toFixed(3),
            qualifying,
            total: scores.length,
          });
        }
      });
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

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 22px 52px" }}>
      <h2
        className="disp"
        style={{ fontSize: 36, fontWeight: 800, marginBottom: 24 }}
      >
        Your Profile
      </h2>

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
            ? "Payout Requested"
            : earnings < 1
              ? "Minimum $1.00 to withdraw"
              : !walletAddress
                ? "Connect wallet first"
                : `Request Payout — $${earnings.toFixed(2)}`}
        </button>
      </div>
    </main>
  );
}
