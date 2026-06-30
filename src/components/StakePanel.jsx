import React, { useState } from "react";
import { T } from "../theme";
import { placeStake } from "../api/stakes";

const STAKE_AMOUNTS = [5, 10, 25, 50];

export default function StakePanel({ pair, coinBalance, hasStaked, userId, onStake }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Don't render if insufficient coins, already staked, or no pair
  if (!pair || pair.length < 2 || coinBalance < 5 || hasStaked) return null;

  const handleConfirm = async () => {
    if (!selectedItem || !selectedAmount || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await placeStake({
        userId,
        itemA: pair[0].id,
        itemB: pair[1].id,
        predictedWinner: selectedItem,
        amount: selectedAmount,
      });
      setSubmitting(false);
      if (result.error) {
        setError(result.error);
      } else {
        onStake(selectedAmount);
        setSelectedItem(null);
        setSelectedAmount(null);
      }
    } catch (e) {
      setSubmitting(false);
      setError(e.message || "Failed to place stake");
    }
  };

  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${T.line}`,
        borderRadius: 16,
        padding: "14px 18px",
        marginBottom: 16,
        maxWidth: 700,
        margin: "0 auto 16px",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          color: "#d97706",
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        PREDICT THE CROWD
      </div>

      {!selectedItem ? (
        <div>
          <div style={{ fontSize: 13, color: T.soft, marginBottom: 10 }}>
            Who will the crowd pick?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {pair.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item.id)}
                style={{
                  flex: 1,
                  background: T.paper,
                  border: `1.5px solid ${T.line}`,
                  borderRadius: 12,
                  padding: "10px 14px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  color: T.ink,
                  textAlign: "center",
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      ) : !selectedAmount ? (
        <div>
          <div style={{ fontSize: 13, color: T.soft, marginBottom: 10 }}>
            How many coins to stake?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STAKE_AMOUNTS.filter((a) => a <= coinBalance).map((amount) => (
              <button
                key={amount}
                onClick={() => setSelectedAmount(amount)}
                style={{
                  background: T.paper,
                  border: `1.5px solid ${T.line}`,
                  borderRadius: 10,
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#d97706",
                }}
              >
                {amount}
              </button>
            ))}
            <button
              onClick={() => setSelectedItem(null)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 12,
                color: T.soft,
                cursor: "pointer",
              }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{selectedAmount} coins</span>{" "}
              <span style={{ color: T.soft }}>on</span>{" "}
              <span style={{ fontWeight: 600 }}>
                {pair.find((p) => p.id === selectedItem)?.name}
              </span>
            </div>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              style={{
                background: "#d97706",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 700,
                cursor: submitting ? "default" : "pointer",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "..." : "Confirm"}
            </button>
            <button
              onClick={() => { setSelectedAmount(null); setSelectedItem(null); setError(null); }}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 12,
                color: T.soft,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <div style={{ fontSize: 12, color: T.pop, marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
