import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { T } from "../theme";
import { fetchHeadToHead } from "../api/stats";
import MatchupShare from "./MatchupShare";

function PollCard({ item, onClick, isWinner, isLoser, showResult }) {
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
        outline: isWinner ? `3px solid ${T.pop}` : "3px solid transparent",
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

export default function PollArena({ poll, onVote, onBack }) {
  const [voted, setVoted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [loser, setLoser] = useState(null);
  const [h2hLabel, setH2hLabel] = useState(null);

  const { itemA, itemB } = poll;

  const handlePick = (picked, other) => {
    setWinner(picked);
    setLoser(other);
    setVoted(true);

    if (onVote) onVote(poll, picked, other);

    fetchHeadToHead(picked.id, other.id).then((h2h) => {
      if (h2h && h2h.total > 0) {
        const pct = Math.round((h2h.aWins / h2h.total) * 100);
        setH2hLabel(`${pct}% picked ${picked.name}`);
      } else {
        setH2hLabel(`You picked ${picked.name}`);
      }
    });
  };

  const pollUrl = (pair) =>
    `${window.location.origin}${window.location.pathname}?poll=${poll.id}`;

  const copyPollLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?poll=${poll.id}`;
    navigator.clipboard.writeText(url).catch(() => {});
  };

  return (
    <div
      style={{
        maxWidth: 1040,
        margin: "0 auto",
        padding: "10px 22px 44px",
        textAlign: "center",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          color: T.soft,
          marginBottom: 6,
          marginTop: 18,
        }}
      >
        TRENDING POLL
      </div>
      <div
        className="disp"
        style={{
          fontSize: "clamp(18px, 4vw, 24px)",
          fontWeight: 700,
          marginBottom: 28,
          color: T.ink,
        }}
      >
        {poll.label}
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "stretch",
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 900,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <PollCard
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
        <PollCard
          item={itemB}
          onClick={() => handlePick(itemB, itemA)}
          isWinner={winner?.id === itemB.id}
          isLoser={loser?.id === itemB.id}
          showResult={voted}
        />
      </div>

      {voted && (
        <div style={{ marginTop: 28, animation: "rise .3s ease both" }}>
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

          <MatchupShare
            pair={[itemA, itemB]}
            onCopyLink={copyPollLink}
            heading="SHARE THIS POLL"
            urlBuilder={pollUrl}
          />

          <button
            onClick={onBack}
            style={{
              marginTop: 24,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "transparent",
              border: `1.5px solid ${T.line}`,
              color: T.ink,
              padding: "10px 22px",
              borderRadius: 99,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={15} /> Browse more polls
          </button>
        </div>
      )}
    </div>
  );
}
