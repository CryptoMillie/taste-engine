import React from "react";
import { T } from "../theme";

/**
 * Shows active campaign info + payout rate above the arena.
 */
export default function CampaignBanner({ campaign }) {
  if (!campaign) return null;

  return (
    <div
      style={{
        maxWidth: 600,
        margin: "0 auto 16px",
        padding: "10px 18px",
        background: T.ink,
        color: T.paper,
        borderRadius: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            background: T.pop,
            padding: "3px 8px",
            borderRadius: 99,
            fontWeight: 700,
          }}
        >
          CAMPAIGN
        </span>
        <span style={{ fontWeight: 600 }}>{campaign.title}</span>
        <span style={{ color: "rgba(255,255,255,.6)", fontSize: 13 }}>
          by {campaign.brand_name}
        </span>
      </div>
      <span
        className="mono"
        style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}
      >
        +${Number(campaign.payout_per_vote).toFixed(2)}/vote
      </span>
    </div>
  );
}
