import React from "react";
import { T } from "../theme";

const sectionStyle = {
  background: T.card,
  border: `1px solid ${T.line}`,
  borderRadius: 18,
  padding: "20px 24px",
  marginBottom: 16,
};

export default function MembershipGate({ membership, earningsRate }) {
  if (!membership) return null;

  const now = Date.now();
  const trialEnd = new Date(membership.trial_ends_at).getTime();
  const trialActive = membership.tier === "free" && trialEnd > now;
  const isPremium = membership.tier === "premium";
  const dailyLimit = 10;
  const dailyUsed = membership.daily_jobs_used || 0;
  const limitReached = !isPremium && !trialActive && dailyUsed >= dailyLimit;

  const hoursLeft = trialActive
    ? Math.max(0, Math.ceil((trialEnd - now) / (60 * 60 * 1000)))
    : 0;

  return (
    <div style={sectionStyle}>
      <div
        className="mono"
        style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
      >
        PLAN
      </div>

      {isPremium ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#16a34a" }}>
            Premium
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
            Unlimited jobs. Full USDC + Taste Coin earnings.
          </div>
        </div>
      ) : trialActive ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#d97706" }}>
            Premium Trial — {hoursLeft}h left
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
            Unlimited earnings during trial. Earn up to ${earningsRate
              ? (earningsRate.usdcPerHour * hoursLeft).toFixed(2)
              : "?"} USDC if you leave it running.
          </div>
        </div>
      ) : limitReached ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: T.pop }}>
            Daily Limit Reached
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
            {dailyUsed}/{dailyLimit} jobs today. Upgrade to keep earning.
          </div>
          <button
            style={{
              marginTop: 12,
              background: "#16a34a",
              color: "#fff",
              border: "none",
              padding: "12px 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Upgrade to Premium — Unlimited Earnings
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            Free — {dailyUsed}/{dailyLimit} jobs today
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
            Upgrade for unlimited jobs and higher USDC payouts.
          </div>
          <button
            style={{
              marginTop: 12,
              background: "#16a34a",
              color: "#fff",
              border: "none",
              padding: "12px 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Upgrade to Premium
          </button>
        </div>
      )}
    </div>
  );
}
