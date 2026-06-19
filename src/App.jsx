import React, { useState, useEffect, useMemo, useRef } from "react";
import { Trophy, ArrowLeft, Sparkles, RotateCcw } from "lucide-react";
import { createStore, pickPair } from "./engine/store";
import { T } from "./theme";
import Arena from "./components/Arena";
import Rankings from "./components/Rankings";
import TasteMeter from "./components/TasteMeter";

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "right", lineHeight: 1.05 }}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: T.soft,
          letterSpacing: "0.16em",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div className="disp" style={{ fontWeight: 700, fontSize: 22, color }}>
        {value}
      </div>
    </div>
  );
}

const btnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  background: T.ink,
  border: "none",
  color: T.paper,
  padding: "10px 16px",
  borderRadius: 99,
  fontSize: 15,
  cursor: "pointer",
  fontWeight: 600,
};

export default function App() {
  const store = useRef(createStore());
  const [items, setItems] = useState(store.current.getItems());
  const [pair, setPair] = useState(() => pickPair(store.current.getItems()));
  const [view, setView] = useState("arena");
  const [votes, setVotes] = useState(store.current.getVotes());
  const [contrarian, setContrarian] = useState(store.current.getContrarian());
  const [verdict, setVerdict] = useState(null);
  const [flash, setFlash] = useState(null);
  const [locking, setLocking] = useState(false);

  const choose = (winner, loser) => {
    if (locking) return;
    setLocking(true);
    const cross = winner.cat !== loser.cat;
    const { delta, upset } = store.current.vote(winner.id, loser.id);
    setVerdict({ winnerId: winner.id, delta });
    setVotes((v) => v + 1);
    if (upset) setContrarian((c) => c + 1);
    if (cross) setFlash(`${winner.name} over ${loser.name}? Bold.`);
    else if (upset && Math.random() < 0.5)
      setFlash("Rare taste — the crowd leans the other way.");
    else if ((votes + 1) % 10 === 0)
      setFlash(`${votes + 1} verdicts in. You're shaping the ranking.`);
    setTimeout(() => {
      const fresh = store.current.getItems();
      setItems(fresh);
      setPair(pickPair(fresh));
      setVerdict(null);
      setLocking(false);
    }, 520);
  };

  const handleReset = () => {
    store.current.reset();
    setItems(store.current.getItems());
    setPair(pickPair(store.current.getItems()));
    setVotes(0);
    setContrarian(0);
    setVerdict(null);
    setFlash("Rankings reset. Fresh start.");
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const ranked = useMemo(
    () => [...items].sort((a, b) => b.rating - a.rating),
    [items]
  );
  const cRate = votes ? contrarian / votes : 0;
  const tasteLabel =
    votes < 6
      ? "Calibrating"
      : cRate > 0.4
        ? "Contrarian"
        : cRate > 0.2
          ? "Eclectic"
          : "Mainstream";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.paper,
        color: T.ink,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 17,
      }}
    >
      {/* Header */}
      <header
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          padding: "26px 22px 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="disp" style={{ fontWeight: 800, fontSize: 30 }}>
            TASTE
          </span>
          <span
            className="mono"
            style={{ fontSize: 12, color: T.soft, letterSpacing: "0.22em" }}
          >
            ENGINE
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Stat label="VERDICTS" value={votes} color={T.ink} />
          <Stat
            label="YOUR TASTE"
            value={tasteLabel}
            color={tasteLabel === "Contrarian" ? T.pop : T.ink}
          />
          <button onClick={() => setView(view === "arena" ? "rankings" : "arena")} style={btnStyle}>
            {view === "arena" ? (
              <>
                <Trophy size={16} /> Rankings
              </>
            ) : (
              <>
                <ArrowLeft size={16} /> Back
              </>
            )}
          </button>
          {votes > 0 && (
            <button
              onClick={handleReset}
              style={{ ...btnStyle, background: "transparent", color: T.soft, padding: "10px 8px" }}
              title="Reset rankings"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Arena view */}
      {view === "arena" ? (
        <main
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "10px 22px 44px",
          }}
        >
          <h1
            className="disp"
            style={{
              textAlign: "center",
              fontSize: "clamp(34px, 6.5vw, 56px)",
              fontWeight: 800,
              margin: "26px 0 30px",
            }}
          >
            Which do you <span style={{ color: T.pop }}>prefer</span>?
          </h1>
          <Arena pair={pair} verdict={verdict} onChoose={choose} />
          <TasteMeter contrarianRate={cRate} />
          <p
            className="mono"
            style={{
              textAlign: "center",
              fontSize: 12,
              color: T.soft,
              marginTop: 34,
              letterSpacing: "0.1em",
            }}
          >
            REAL TRENDING DATA · YOUR TAPS BUILD THE RANKING
          </p>
        </main>
      ) : (
        <Rankings ranked={ranked} />
      )}

      {/* Toast */}
      {flash && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 28,
            transform: "translateX(-50%)",
            background: T.ink,
            color: T.paper,
            padding: "13px 20px",
            borderRadius: 99,
            fontSize: 15,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 9,
            boxShadow: "0 12px 40px rgba(20,16,10,.35)",
            animation: "rise .25s ease both",
            maxWidth: "90vw",
            textAlign: "center",
          }}
        >
          <Sparkles size={16} color={T.pop} /> {flash}
        </div>
      )}
    </div>
  );
}
