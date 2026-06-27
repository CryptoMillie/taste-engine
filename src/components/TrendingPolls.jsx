import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { POLL_CATEGORIES } from "../data/polls";
import { fetchHeadToHead } from "../api/stats";
import { fetchLiveTrending } from "../api/trending";

const VOTED_KEY = "taste-polls-voted";

function getVotedPolls() {
  try {
    return JSON.parse(localStorage.getItem(VOTED_KEY) || "{}");
  } catch {
    return {};
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ResultBar({ poll, pickedId, savedPctA }) {
  const [pctA, setPctA] = useState(savedPctA ?? null);

  useEffect(() => {
    fetchHeadToHead(poll.itemA.id, poll.itemB.id).then((h2h) => {
      let pct;
      if (h2h && h2h.total > 0) {
        pct = Math.round((h2h.aWins / h2h.total) * 100);
      } else {
        pct = pickedId === poll.itemA.id ? 100 : 0;
      }
      setPctA(pct);
      try {
        const voted = JSON.parse(localStorage.getItem(VOTED_KEY) || "{}");
        if (voted[poll.id]) {
          voted[poll.id].pctA = pct;
          localStorage.setItem(VOTED_KEY, JSON.stringify(voted));
        }
      } catch { /* ignore */ }
    }).catch(() => {});
  }, [poll, pickedId]);

  if (pctA === null) return null;
  const pctB = 100 - pctA;

  return (
    <div style={{ marginTop: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          fontWeight: 700,
          marginBottom: 3,
        }}
      >
        <span style={{ color: pctA >= pctB ? T.pop : T.soft }}>{pctA}%</span>
        <span style={{ color: pctB > pctA ? T.pop : T.soft }}>{pctB}%</span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: T.line,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <div
          style={{
            width: `${pctA}%`,
            background: T.pop,
            borderRadius: "3px 0 0 3px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

function PollCard({ poll, voteData, onSelect }) {
  const isVoted = !!voteData;

  return (
    <button
      onClick={() => onSelect(poll)}
      style={{
        background: T.card,
        border: `1.5px solid ${isVoted ? "#22c55e44" : T.line}`,
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
        {isVoted && <ResultBar poll={poll} pickedId={voteData.pickedId} savedPctA={voteData.pctA} />}
      </div>
    </button>
  );
}

function LiveMatchupCard({ matchup, onSelect }) {
  return (
    <button
      onClick={() => onSelect(matchup)}
      style={{
        background: T.card,
        border: `1.5px solid #d9770633`,
        borderRadius: 18,
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        textAlign: "left",
        width: "100%",
        position: "relative",
        minWidth: 280,
      }}
    >
      <div style={{ display: "flex", height: 140 }}>
        <div
          style={{
            flex: 1,
            backgroundImage: matchup.itemA.img ? `url("${matchup.itemA.img}")` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center top",
            position: "relative",
            backgroundColor: "#cfcabd",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.6) 100%)",
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
            {matchup.itemA.name}
          </div>
        </div>
        <div
          className="disp"
          style={{
            position: "absolute",
            left: "50%",
            top: 58,
            transform: "translate(-50%, -50%)",
            background: "#d97706",
            color: "#fff",
            fontSize: 9,
            fontWeight: 800,
            padding: "3px 7px",
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
            backgroundImage: matchup.itemB.img ? `url("${matchup.itemB.img}")` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center top",
            position: "relative",
            backgroundColor: "#cfcabd",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.6) 100%)",
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
            {matchup.itemB.name}
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 14px" }}>
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "#d97706",
            background: "#d9770614",
            padding: "3px 8px",
            borderRadius: 99,
            fontWeight: 600,
          }}
        >
          {matchup.category.toUpperCase()}
        </span>
      </div>
    </button>
  );
}

export default function TrendingPolls({ polls, onSelectPoll }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [liveMatchups, setLiveMatchups] = useState([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const votedPolls = getVotedPolls();

  useEffect(() => {
    fetchLiveTrending()
      .then(setLiveMatchups)
      .finally(() => setLiveLoading(false));
  }, []);

  const filtered =
    activeCategory === "All"
      ? polls
      : polls.filter((p) => p.category === activeCategory);

  const handleLiveSelect = (matchup) => {
    // Convert live matchup to poll-like object for PollArena
    const poll = {
      id: matchup.id,
      itemA: matchup.itemA,
      itemB: matchup.itemB,
      category: matchup.category,
      label: `${matchup.itemA.name} vs ${matchup.itemB.name}`,
    };
    onSelectPoll(poll);
  };

  const latestRefresh = liveMatchups[0]?.refreshedAt;

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

      {/* Live Trending Section */}
      {!liveLoading && liveMatchups.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
            <div
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                color: "#d97706",
                fontWeight: 700,
              }}
            >
              LIVE TRENDING
            </div>
            {latestRefresh && (
              <span style={{ fontSize: 11, color: T.soft }}>
                Updated {timeAgo(latestRefresh)}
              </span>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 14,
            }}
          >
            {liveMatchups.map((matchup) => (
              <LiveMatchupCard
                key={matchup.id}
                matchup={matchup}
                onSelect={handleLiveSelect}
              />
            ))}
          </div>
        </div>
      )}

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
            voteData={votedPolls[poll.id] || null}
            onSelect={onSelectPoll}
          />
        ))}
      </div>
    </div>
  );
}
