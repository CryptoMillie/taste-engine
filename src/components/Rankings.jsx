import React from "react";
import { T } from "../theme";

const BASE = 1200;

export default function Rankings({ ranked }) {
  const topR = ranked.length ? ranked[0].rating : BASE;

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "10px 22px 52px",
      }}
    >
      <h2
        className="disp"
        style={{
          fontSize: "clamp(30px, 5vw, 46px)",
          fontWeight: 800,
          margin: "20px 0 8px",
        }}
      >
        The crowd's favorites
      </h2>
      <p
        style={{
          fontSize: 16,
          color: T.soft,
          margin: "0 0 28px",
          lineHeight: 1.5,
        }}
      >
        Built from your taps alone. Nobody scored a thing.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ranked.map((it, i) => (
          <div
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: T.card,
              border: `1px solid ${T.line}`,
              borderRadius: 18,
              padding: "12px 16px",
              animation: `rise .3s ease ${i * 0.02}s both`,
            }}
          >
            <span
              className="disp"
              style={{
                width: 40,
                fontSize: 26,
                fontWeight: 800,
                color: i === 0 ? T.pop : T.line,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                backgroundColor: "#cfcabd",
                backgroundImage: `url("${it.img}")`,
                backgroundSize: "cover",
                backgroundPosition: "center top",
                flex: "0 0 auto",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="disp"
                style={{
                  fontWeight: 700,
                  fontSize: 19,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {it.name}
              </div>
              <div
                style={{
                  height: 5,
                  borderRadius: 99,
                  background: "#EEEBE2",
                  marginTop: 8,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(
                      6,
                      ((it.rating - BASE + 400) / (topR - BASE + 400)) * 100
                    )}%`,
                    background: T.pop,
                  }}
                />
              </div>
            </div>
            <span
              className="mono"
              style={{ color: T.ink, fontSize: 15, fontWeight: 700 }}
            >
              {it.rating}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
