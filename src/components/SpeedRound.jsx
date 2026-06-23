import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { T } from "../theme";
import { pickPair } from "../engine/store";
import { socialBtnStyle } from "./MatchupShare";

const ROUND_DURATION = 60; // seconds
const MAX_VOTES = 20;

export default function SpeedRound({ items, store, onComplete, onBack }) {
  const [pair, setPair] = useState(() => pickPair(items));
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION);
  const [votesInRound, setVotesInRound] = useState(0);
  const [verdict, setVerdict] = useState(null);
  const [finished, setFinished] = useState(false);
  const timesRef = useRef([]);
  const pairShownAt = useRef(Date.now());
  const timerRef = useRef(null);

  // Start countdown
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setFinished(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const choose = useCallback((winner, loser) => {
    if (finished) return;

    const elapsed = Date.now() - pairShownAt.current;
    timesRef.current.push(elapsed);

    store.current.vote(winner.id, loser.id);
    setVerdict({ winnerId: winner.id });

    const newCount = votesInRound + 1;
    setVotesInRound(newCount);

    if (newCount >= MAX_VOTES) {
      clearInterval(timerRef.current);
      setTimeout(() => {
        setVerdict(null);
        setFinished(true);
      }, 300);
      return;
    }

    // Quick flash then next pair — much faster than normal 520ms
    setTimeout(() => {
      const fresh = store.current.getItems();
      setPair(pickPair(fresh));
      setVerdict(null);
      pairShownAt.current = Date.now();
    }, 200);
  }, [finished, votesInRound, store]);

  // Results screen
  if (finished) {
    const totalTime = timesRef.current.reduce((a, b) => a + b, 0);
    const avgTime = votesInRound > 0 ? Math.round(totalTime / votesInRound) : 0;
    const elapsed = ROUND_DURATION - timeLeft;
    const shareText = `I voted ${votesInRound} times in ${elapsed}s on Taste Engine Speed Round! Avg ${(avgTime / 1000).toFixed(1)}s per vote. Can you beat that?`;
    const shareUrl = `${window.location.origin}${window.location.pathname}`;

    return (
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "40px 22px", textAlign: "center" }}>
        <div
          className="disp"
          style={{ fontSize: "clamp(32px, 6vw, 48px)", fontWeight: 800, marginBottom: 8 }}
        >
          {votesInRound >= 15 ? "SPEED DEMON" : votesInRound >= 10 ? "NICE WORK" : "GOOD TRY"}
        </div>
        <div className="mono" style={{ fontSize: 11, color: T.soft, letterSpacing: "0.14em", marginBottom: 30 }}>
          SPEED ROUND COMPLETE
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 30 }}>
          <div style={{ textAlign: "center" }}>
            <div className="disp" style={{ fontSize: 42, fontWeight: 800, color: T.pop }}>{votesInRound}</div>
            <div className="mono" style={{ fontSize: 10, color: T.soft, letterSpacing: "0.12em" }}>VOTES</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="disp" style={{ fontSize: 42, fontWeight: 800 }}>{elapsed}s</div>
            <div className="mono" style={{ fontSize: 10, color: T.soft, letterSpacing: "0.12em" }}>TIME</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="disp" style={{ fontSize: 42, fontWeight: 800 }}>{(avgTime / 1000).toFixed(1)}s</div>
            <div className="mono" style={{ fontSize: 10, color: T.soft, letterSpacing: "0.12em" }}>AVG</div>
          </div>
        </div>

        {/* Share buttons */}
        <div className="mono" style={{ fontSize: 10, letterSpacing: "0.16em", color: T.soft, marginBottom: 10 }}>
          SHARE YOUR SCORE
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 30 }}>
          <button
            onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, "_blank")}
            style={socialBtnStyle("#000000")}
          >
            Post on 𝕏
          </button>
          <button
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`, "_blank")}
            style={socialBtnStyle("#25D366")}
          >
            WhatsApp
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(shareText + " " + shareUrl).catch(() => {});
            }}
            style={socialBtnStyle(T.ink)}
          >
            Copy
          </button>
        </div>

        <button
          onClick={() => {
            onComplete({ votesInRound, elapsed, avgTime });
          }}
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
          Back to Arena
        </button>
      </div>
    );
  }

  // Active round
  const pct = (timeLeft / ROUND_DURATION) * 100;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "10px 22px 44px" }}>
      {/* Timer bar */}
      <div style={{ position: "relative", height: 6, background: T.line, borderRadius: 3, marginBottom: 18 }}>
        <div
          className="speed-timer-bar"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: `${pct}%`,
            background: timeLeft <= 10 ? T.pop : T.ink,
            borderRadius: 3,
            transition: "width 1s linear, background 0.3s",
          }}
        />
      </div>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={() => {
            clearInterval(timerRef.current);
            onBack();
          }}
          style={{ background: "none", border: "none", cursor: "pointer", color: T.soft, display: "flex", alignItems: "center", gap: 4 }}
        >
          <ArrowLeft size={16} /> <span className="mono" style={{ fontSize: 11 }}>QUIT</span>
        </button>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <div className="mono" style={{ fontSize: 13, color: T.soft }}>
            {votesInRound}/{MAX_VOTES}
          </div>
          <div
            className="disp"
            style={{ fontSize: 28, fontWeight: 800, color: timeLeft <= 10 ? T.pop : T.ink }}
          >
            {timeLeft}s
          </div>
        </div>
      </div>

      {/* Cards — same layout as Arena */}
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "stretch",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {pair.map((it, idx) => {
          const isWin = verdict?.winnerId === it.id;
          const isLose = verdict && !isWin;
          return (
            <React.Fragment key={it.id}>
              <button
                onClick={() => choose(it, pair[1 - idx])}
                className={`card ${isWin ? "win" : ""} ${isLose ? "lose" : ""}`}
                style={{
                  flex: "1 1 280px",
                  maxWidth: 460,
                  minHeight: "min(380px, 50vh)",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 26,
                  padding: 0,
                  position: "relative",
                  overflow: "hidden",
                  backgroundColor: "#cfcabd",
                  backgroundImage: `url("${it.img}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center top",
                  textAlign: "left",
                  outline: isWin ? `3px solid ${T.pop}` : "3px solid transparent",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.72) 100%)",
                  }}
                />
                <div style={{ position: "absolute", top: 16, left: 18 }}>
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
                    {it.cat.toUpperCase()}
                  </span>
                </div>
                <div style={{ position: "absolute", left: 24, bottom: 22, right: 24 }}>
                  <div
                    className="disp"
                    style={{
                      fontWeight: 700,
                      fontSize: "clamp(24px, 4vw, 36px)",
                      color: "#fff",
                      textShadow: "0 2px 12px rgba(0,0,0,.5)",
                    }}
                  >
                    {it.name}
                  </div>
                  {it.sub && (
                    <div
                      className="mono"
                      style={{ fontSize: 11, color: "rgba(255,255,255,.82)", letterSpacing: "0.1em", marginTop: 5 }}
                    >
                      {it.sub}
                    </div>
                  )}
                </div>
              </button>
              {idx === 0 && (
                <div
                  className="disp"
                  style={{ alignSelf: "center", color: T.line, fontSize: 26, fontWeight: 800, flex: "0 0 auto" }}
                >
                  VS
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mono" style={{ textAlign: "center", fontSize: 11, color: T.soft, marginTop: 18, letterSpacing: "0.12em" }}>
        TAP FAST — EVERY VOTE COUNTS
      </div>
    </div>
  );
}
