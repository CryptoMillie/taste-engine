import React from "react";
import { T } from "../theme";

const sectionStyle = {
  background: T.card,
  border: `1px solid ${T.line}`,
  borderRadius: 18,
  padding: "20px 24px",
  marginBottom: 16,
};

export default function MembershipGate({ membership }) {
  if (!membership) return null;

  const now = Date.now();
  const trialEnd = new Date(membership.trial_ends_at).getTime();
  const trialActive = membership.tier === "free" && trialEnd > now;
  const isPremium = membership.tier === "premium";
  const dailyLimit = 10;
  const dailyUsed = membership.daily_jobs_used || 0;
  const limitReached = !isPremium && !trialActive && dailyUsed >= dailyLimit;

  // Hours remaining in trial
  const hoursLeft = trialActive ? Math.max(0, Math.ceil((trialEnd - now) / (60 * 60 * 1000))) : 0;

  return (
    <div style={sectionStyle}>
      <div
        className="mono"
        style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
      >
        MEMBERSHIP
      </div>

      {isPremium ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#d97706" }}>
            Premium
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
            Unlimited jobs. USD earnings enabled.
          </div>
        </div>
      ) : trialActive ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#d97706" }}>
            Premium Trial
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
            {hoursLeft} hours remaining. Unlimited jobs during trial.
          </div>
        </div>
      ) : limitReached ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: T.pop }}>
            Daily Limit Reached
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
            {dailyUsed}/{dailyLimit} jobs today. Come back tomorrow or upgrade.
          </div>
          <button
            style={{
              marginTop: 12,
              background: "#d97706",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Upgrade to Premium
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            Free Tier
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
            {dailyUsed}/{dailyLimit} jobs today. Upgrade for unlimited.
          </div>
          <button
            style={{
              marginTop: 12,
              background: "#d97706",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Upgrade to Premium
          </button>
        </div>
      )}
    </div>
  );
}
