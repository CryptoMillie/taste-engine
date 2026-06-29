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
  const fallback = pickedId === poll.itemA.id ? 100 : 0;
  const [pctA, setPctA] = useState(savedPctA ?? fallback);

  useEffect(() => {
    fetchHeadToHead(poll.itemA.id, poll.itemB.id).then((h2h) => {
      let pct;
      if (h2h && h2h.total > 0) {
        pct = Math.round((h2h.aWins / h2h.total) * 100);
      } else {
        pct = fallback;
      }
      setPctA(pct);
      try {
        const voted = JSON.parse(localStorage.getItem(VOTED_KEY) || "{}");
        if (voted[poll.id]) {
          voted[poll.id].pctA = pct;
          localStorage.setItem(VOTED_KEY, JSON.stringify(voted));
        }
      } catch { /* ignore */ }
    }).catch(() => setPctA(fallback));
  }, [poll, pickedId, fallback]);

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

function PollCard({ poll, voteData, onSelect, isLive }) {
  const isVoted = !!voteData;

  return (
    <button
      onClick={() => onSelect(poll)}
      style={{
        background: T.card,
        border: `1.5px solid ${isLive ? "#d9770633" : isVoted ? "#22c55e44" : T.line}`,
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
            backgroundImage: poll.itemA.img ? `url("${poll.itemA.img}")` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center top",
            position: "relative",
            backgroundColor: poll.itemA.img ? undefined : "#cfcabd",
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
            background: isLive ? "#d97706" : T.ink,
            color: isLive ? "#fff" : T.paper,
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
            backgroundImage: poll.itemB.img ? `url("${poll.itemB.img}")` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center top",
            position: "relative",
            backgroundColor: poll.itemB.img ? undefined : "#cfcabd",
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
          {isLive && (
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "#d97706",
                background: "#d9770618",
                padding: "3px 8px",
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              LIVE
            </span>
          )}
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

  // Convert live matchups to poll-like objects
  const livePolls = liveMatchups.map((m) => ({
    id: m.id,
    itemA: m.itemA,
    itemB: m.itemB,
    category: m.category,
    label: `${m.itemA.name} vs ${m.itemB.name}`,
    _isLive: true,
  }));

  // Filter curated polls by category (unless "Live" is selected)
  const filteredCurated =
    activeCategory === "All"
      ? polls
      : activeCategory === "Live"
        ? []
        : polls.filter((p) => p.category === activeCategory);

  // Filter live polls — show all for "All" or "Live", otherwise match category
  const filteredLive =
    activeCategory === "All" || activeCategory === "Live"
      ? livePolls
      : livePolls.filter((p) => p.category === activeCategory);

  // Interleave: insert one live matchup every 2 curated polls
  const combined = [];
  const liveQueue = [...filteredLive];
  for (let i = 0; i < filteredCurated.length; i++) {
    combined.push(filteredCurated[i]);
    if ((i + 1) % 2 === 0 && liveQueue.length > 0) {
      combined.push(liveQueue.shift());
    }
  }
  // Append remaining live matchups at the end
  combined.push(...liveQueue);

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
          marginBottom: latestRefresh ? 4 : 22,
        }}
      >
        TAP A POLL TO CAST YOUR VOTE
      </p>
      {latestRefresh && (
        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: T.soft,
            marginBottom: 22,
          }}
        >
          Live matchups updated {timeAgo(latestRefresh)}
        </p>
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

      {/* 2-column grid with interleaved live matchups */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 18,
        }}
      >
        {combined.map((poll) => (
          <PollCard
            key={poll.id}
            poll={poll}
            voteData={votedPolls[poll.id] || null}
            onSelect={onSelectPoll}
            isLive={!!poll._isLive}
          />
        ))}
      </div>
    </div>
  );
}
