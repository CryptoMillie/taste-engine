import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { fetchHeadToHead } from "../api/stats";

function ChallengeCard({ item, onClick, isWinner, isLoser, showResult }) {
  return (
    <button
      onClick={onClick}
      disabled={showResult}
      style={{
        flex: "1 1 280px",
        maxWidth: 420,
        minHeight: 380,
        border: "none",
        cursor: showResult ? "default" : "pointer",
        borderRadius: 22,
        padding: 0,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#cfcabd",
        backgroundImage: `url("${item.img}")`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        textAlign: "left",
        outline: isWinner
          ? `3px solid ${T.pop}`
          : "3px solid transparent",
        opacity: isLoser ? 0.5 : 1,
        transition: "opacity 0.3s ease, outline 0.3s ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.72) 100%)",
        }}
      />
      <div style={{ position: "absolute", top: 14, left: 16 }}>
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "#fff",
            background: "rgba(0,0,0,.4)",
            padding: "4px 9px",
            borderRadius: 99,
            backdropFilter: "blur(4px)",
          }}
        >
          {item.cat.toUpperCase()}
        </span>
      </div>
      <div style={{ position: "absolute", left: 22, bottom: 20, right: 22 }}>
        <div
          className="disp"
          style={{
            fontWeight: 700,
            fontSize: "clamp(24px, 4vw, 34px)",
            color: "#fff",
            textShadow: "0 2px 12px rgba(0,0,0,.5)",
          }}
        >
          {item.name}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,.82)",
            letterSpacing: "0.1em",
            marginTop: 6,
          }}
        >
          {item.sub}
        </div>
      </div>
      {isWinner && (
        <div
          className="mono"
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            animation: "tick .45s ease-out",
            color: "#fff",
            background: T.pop,
            padding: "4px 12px",
            borderRadius: 99,
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          YOUR PICK
        </div>
      )}
    </button>
  );
}

export default function Challenge({ itemA, itemB, onEnterApp, onVote, challengerPick }) {
  const [voted, setVoted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [loser, setLoser] = useState(null);
  const [h2hLabel, setH2hLabel] = useState(null);
  const [matchResult, setMatchResult] = useState(null); // "agree" | "disagree" | null

  const handlePick = (picked, other) => {
    setWinner(picked);
    setLoser(other);
    setVoted(true);

    // Check agree/disagree with challenger
    if (challengerPick) {
      setMatchResult(picked.id === challengerPick ? "agree" : "disagree");
    }

    // Register the vote locally
    if (onVote) onVote(picked, other);

    // Fetch head-to-head data
    fetchHeadToHead(picked.id, other.id).then((h2h) => {
      if (h2h && h2h.total > 0) {
        const pct = Math.round((h2h.aWins / h2h.total) * 100);
        setH2hLabel(`${pct}% picked ${picked.name}`);
      } else {
        setH2hLabel(`You picked ${picked.name}`);
      }
    });
  };

  if (!itemA || !itemB) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: T.paper,
          color: T.ink,
          fontFamily: "'Inter', system-ui, sans-serif",
          padding: 22,
          textAlign: "center",
        }}
      >
        <div className="disp" style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
          This challenge has expired
        </div>
        <p style={{ color: T.soft, marginBottom: 24, fontSize: 15 }}>
          The items in this challenge couldn't be found.
        </p>
        <button
          onClick={onEnterApp}
          style={{
            background: T.ink,
            color: T.paper,
            border: "none",
            padding: "12px 28px",
            borderRadius: 99,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Start voting
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: T.paper,
        color: T.ink,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 22,
      }}
    >
      {!voted ? (
        <>
          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              color: T.soft,
              marginBottom: 10,
            }}
          >
            {challengerPick ? "YOUR FRIEND MADE THEIR PICK" : "SOMEONE CHALLENGED YOU"}
          </div>
          <h1
            className="disp"
            style={{
              fontSize: "clamp(28px, 5vw, 44px)",
              fontWeight: 800,
              marginBottom: 32,
              textAlign: "center",
            }}
          >
            Which do you <span style={{ color: T.pop }}>prefer</span>?
          </h1>
        </>
      ) : (
        <>
          {matchResult && (
            <div
              style={{
                textAlign: "center",
                marginBottom: 16,
                animation: "rise .3s ease both",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 4 }}>
                {matchResult === "agree" ? "\u{1F91D}" : "\u{1F624}"}
              </div>
              <div
                className="disp"
                style={{
                  fontSize: "clamp(22px, 4vw, 32px)",
                  fontWeight: 800,
                  color: matchResult === "agree" ? "#22c55e" : T.pop,
                }}
              >
                {matchResult === "agree" ? "You agree!" : "You disagree!"}
              </div>
            </div>
          )}
          {!matchResult && (
            <div
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.18em",
                color: T.soft,
                marginBottom: 16,
              }}
            >
              YOUR VERDICT
            </div>
          )}
        </>
      )}

      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "stretch",
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 900,
          width: "100%",
        }}
      >
        <ChallengeCard
          item={itemA}
          onClick={() => handlePick(itemA, itemB)}
          isWinner={winner?.id === itemA.id}
          isLoser={loser?.id === itemA.id}
          showResult={voted}
        />
        <div
          className="disp"
          style={{
            alignSelf: "center",
            color: T.line,
            fontSize: 24,
            fontWeight: 800,
            flex: "0 0 auto",
          }}
        >
          VS
        </div>
        <ChallengeCard
          item={itemB}
          onClick={() => handlePick(itemB, itemA)}
          isWinner={winner?.id === itemB.id}
          isLoser={loser?.id === itemB.id}
          showResult={voted}
        />
      </div>

      {voted && (
        <div
          style={{
            marginTop: 28,
            textAlign: "center",
            animation: "rise .3s ease both",
          }}
        >
          {h2hLabel && (
            <div
              className="disp"
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 20,
                color: T.ink,
              }}
            >
              {h2hLabel}
            </div>
          )}
          <button
            onClick={onEnterApp}
            style={{
              background: T.pop,
              color: "#fff",
              border: "none",
              padding: "14px 32px",
              borderRadius: 99,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Build your full taste profile →
          </button>
        </div>
      )}
    </div>
  );
}
