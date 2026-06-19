import React from "react";
import { T } from "../theme";

export default function TasteMeter({ contrarianRate }) {
  return (
    <div style={{ maxWidth: 480, margin: "34px auto 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          className="mono"
          style={{ fontSize: 11, color: T.soft, letterSpacing: "0.14em" }}
        >
          MAINSTREAM
        </span>
        <span
          className="mono"
          style={{ fontSize: 11, color: T.soft, letterSpacing: "0.14em" }}
        >
          CONTRARIAN
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 99,
          background: "#E8E5DC",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${Math.min(contrarianRate * 100, 97)}%`,
            top: -3,
            width: 14,
            height: 14,
            borderRadius: 99,
            background: T.pop,
            transition: "left .5s ease",
            transform: "translateX(-50%)",
            boxShadow: `0 0 0 4px ${T.paper}`,
          }}
        />
      </div>
    </div>
  );
}
