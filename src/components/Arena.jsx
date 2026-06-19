import React from "react";
import { T } from "../theme";

export default function Arena({ pair, verdict, onChoose }) {
  return (
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
              onClick={() => onChoose(it, pair[1 - idx])}
              className={`card ${isWin ? "win" : ""} ${isLose ? "lose" : ""}`}
              style={{
                flex: "1 1 340px",
                maxWidth: 460,
                minHeight: 420,
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
                outline: isWin
                  ? `3px solid ${T.pop}`
                  : "3px solid transparent",
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
              <span
                className="mono"
                style={{
                  position: "absolute",
                  top: 16,
                  left: 18,
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
              <div style={{ position: "absolute", left: 24, bottom: 22, right: 24 }}>
                <div
                  className="disp"
                  style={{
                    fontWeight: 700,
                    fontSize: "clamp(26px, 4vw, 38px)",
                    color: "#fff",
                    textShadow: "0 2px 12px rgba(0,0,0,.5)",
                  }}
                >
                  {it.name}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,.82)",
                    letterSpacing: "0.1em",
                    marginTop: 7,
                  }}
                >
                  {it.sub}
                </div>
              </div>
              {isWin && (
                <div
                  className="tick mono"
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 18,
                    animation: "tick .45s ease-out",
                    color: "#fff",
                    background: T.pop,
                    padding: "4px 12px",
                    borderRadius: 99,
                    fontWeight: 700,
                    fontSize: 20,
                  }}
                >
                  +{verdict.delta}
                </div>
              )}
            </button>
            {idx === 0 && (
              <div
                className="disp"
                style={{
                  alignSelf: "center",
                  color: T.line,
                  fontSize: 26,
                  fontWeight: 800,
                  flex: "0 0 auto",
                }}
              >
                VS
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
