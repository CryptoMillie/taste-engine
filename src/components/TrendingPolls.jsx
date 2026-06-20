import React, { useState } from "react";
import { T } from "../theme";
import { POLL_CATEGORIES } from "../data/polls";

const VOTED_KEY = "taste-polls-voted";

function getVotedPolls() {
  try {
    return JSON.parse(localStorage.getItem(VOTED_KEY) || "[]");
  } catch {
    return [];
  }
}

function PollCard({ poll, isVoted, onSelect }) {
  return (
    <button
      onClick={() => onSelect(poll)}
      style={{
        background: T.card,
        border: `1.5px solid ${T.line}`,
        borderRadius: 18,
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        textAlign: "left",
        width: "100%",
        position: "relative",
      }}
    >
      {/* Thumbnails side-by-side */}
      <div style={{ display: "flex", height: 160 }}>
        <div
          style={{
            flex: 1,
            backgroundImage: `url("${poll.itemA.img}")`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,.55) 100%)",
            }}
          />
          <div
            className="disp"
            style={{
              position: "absolute",
              bottom: 8,
              left: 10,
              right: 4,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              textShadow: "0 1px 6px rgba(0,0,0,.6)",
              lineHeight: 1.2,
            }}
          >
            {poll.itemA.name}
          </div>
        </div>
        <div
          className="disp"
          style={{
            position: "absolute",
            left: "50%",
            top: 68,
            transform: "translate(-50%, -50%)",
            background: T.ink,
            color: T.paper,
            fontSize: 10,
            fontWeight: 800,
            padding: "4px 8px",
            borderRadius: 99,
            zIndex: 2,
            letterSpacing: "0.05em",
          }}
        >
          VS
        </div>
        <div
          style={{
            flex: 1,
            backgroundImage: `url("${poll.itemB.img}")`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,.55) 100%)",
            }}
          />
          <div
            className="disp"
            style={{
              position: "absolute",
              bottom: 8,
              right: 10,
              left: 4,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              textShadow: "0 1px 6px rgba(0,0,0,.6)",
              textAlign: "right",
              lineHeight: 1.2,
            }}
          >
            {poll.itemB.name}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              color: T.pop,
              background: `${T.pop}14`,
              padding: "3px 8px",
              borderRadius: 99,
              fontWeight: 600,
            }}
          >
            {poll.category.toUpperCase()}
          </span>
          {isVoted && (
            <span
              style={{
                fontSize: 12,
                color: "#22c55e",
                fontWeight: 700,
              }}
            >
              ✓ Voted
            </span>
          )}
        </div>
        <div
          className="disp"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: T.ink,
            lineHeight: 1.3,
          }}
        >
          {poll.label}
        </div>
      </div>
    </button>
  );
}

export default function TrendingPolls({ polls, onSelectPoll }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const votedPolls = getVotedPolls();

  const filtered =
    activeCategory === "All"
      ? polls
      : polls.filter((p) => p.category === activeCategory);

  return (
    <div
      style={{
        maxWidth: 1040,
        margin: "0 auto",
        padding: "10px 22px 44px",
      }}
    >
      <h2
        className="disp"
        style={{
          textAlign: "center",
          fontSize: "clamp(28px, 5vw, 42px)",
          fontWeight: 800,
          margin: "20px 0 8px",
        }}
      >
        Trending <span style={{ color: T.pop }}>Polls</span>
      </h2>
      <p
        className="mono"
        style={{
          textAlign: "center",
          fontSize: 12,
          color: T.soft,
          letterSpacing: "0.1em",
          marginBottom: 22,
        }}
      >
        TAP A POLL TO CAST YOUR VOTE
      </p>

      {/* Category filter pills */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        {POLL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              padding: "7px 16px",
              borderRadius: 99,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              background: activeCategory === cat ? T.ink : T.line,
              color: activeCategory === cat ? T.paper : T.ink,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 2-column grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 18,
        }}
      >
        {filtered.map((poll) => (
          <PollCard
            key={poll.id}
            poll={poll}
            isVoted={votedPolls.includes(poll.id)}
            onSelect={onSelectPoll}
          />
        ))}
      </div>
    </div>
  );
}
