import React, { useState } from "react";
import { T } from "../theme";

export default function MysteryCard({ mystery, userId, onSubmitTheory }) {
  const [expanded, setExpanded] = useState(false);
  const [theory, setTheory] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!theory.trim() || !userId || submitted) return;
    setSubmitted(true);
    if (onSubmitTheory) {
      await onSubmitTheory(mystery.id, theory);
    }
  };

  const typeLabels = {
    correlation: "HIDDEN LINK",
    upset: "GIANT KILLER",
    crossover: "CROSSOVER",
  };

  return (
    <div
      style={{
        background: T.card,
        border: "1.5px solid #7c3aed44",
        borderRadius: 18,
        overflow: "hidden",
        width: "100%",
      }}
    >
      {/* Purple gradient banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
          padding: "18px 16px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          className="disp"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          ?
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.8)",
                background: "rgba(255,255,255,0.15)",
                padding: "3px 8px",
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              MYSTERY
            </span>
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.1em",
                color: "rgba(255,255,255,0.6)",
                fontWeight: 600,
              }}
            >
              {typeLabels[mystery.mystery_type] || "MYSTERY"}
            </span>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "14px 16px 16px" }}>
        <div
          className="disp"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: T.ink,
            lineHeight: 1.3,
            marginBottom: 6,
          }}
        >
          {mystery.title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: T.soft,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          {mystery.description}
        </div>

        {/* Expandable theory section */}
        {!expanded && !submitted ? (
          <button
            onClick={() => setExpanded(true)}
            style={{
              width: "100%",
              background: "#7c3aed14",
              color: "#7c3aed",
              border: "1px solid #7c3aed33",
              padding: "10px 16px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Submit your theory (+10 coins)
          </button>
        ) : submitted ? (
          <div
            style={{
              padding: "10px 14px",
              background: "#16a34a14",
              borderRadius: 12,
              fontSize: 13,
              color: "#16a34a",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            Theory submitted! +10 coins
          </div>
        ) : (
          <div>
            <textarea
              value={theory}
              onChange={(e) => setTheory(e.target.value)}
              placeholder="What's your theory?"
              maxLength={500}
              style={{
                width: "100%",
                minHeight: 60,
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${T.line}`,
                fontSize: 13,
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={!theory.trim() || !userId}
              style={{
                width: "100%",
                marginTop: 8,
                background: theory.trim() && userId ? "#7c3aed" : T.line,
                color: theory.trim() && userId ? "#fff" : T.soft,
                border: "none",
                padding: "10px 16px",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
                cursor: theory.trim() && userId ? "pointer" : "default",
              }}
            >
              Submit Theory (+10 coins)
            </button>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
            fontSize: 11,
            color: T.soft,
          }}
        >
          <span>{mystery.theory_count || 0} theories</span>
          <span style={{ color: "#d97706" }}>+10 coins per theory</span>
        </div>
      </div>
    </div>
  );
}
