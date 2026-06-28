import React from "react";
import { T } from "../theme";
import MembershipGate from "./MembershipGate";

const sectionStyle = {
  background: T.card,
  border: `1px solid ${T.line}`,
  borderRadius: 18,
  padding: "20px 24px",
  marginBottom: 16,
};

export default function ComputeDashboard({
  gpuAvailable,
  gpuInfo,
  enabled,
  toggle,
  status,
  currentJob,
  jobsThisSession,
  coinsThisSession,
  workerStats,
  membership,
}) {
  if (!gpuAvailable) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 22px 52px" }}>
        <h2 className="disp" style={{ fontSize: 36, fontWeight: 800, marginBottom: 24 }}>
          GPU Compute
        </h2>
        <div style={sectionStyle}>
          <div
            className="mono"
            style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
          >
            WEBGPU STATUS
          </div>
          <div style={{ fontSize: 15, color: T.pop, fontWeight: 600 }}>
            WebGPU is not available in this browser.
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 8 }}>
            Try Chrome 113+ or Edge 113+ with WebGPU enabled.
          </div>
        </div>
      </main>
    );
  }

  const totalJobs = workerStats?.total_jobs || 0;
  const totalCoins = workerStats?.total_coins_earned || 0;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 22px 52px" }}>
      <h2 className="disp" style={{ fontSize: 36, fontWeight: 800, marginBottom: 24 }}>
        GPU Compute
      </h2>

      {/* GPU Status — renderer/vendor shown locally only, never sent to server */}
      <div style={sectionStyle}>
        <div
          className="mono"
          style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
        >
          GPU STATUS
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: enabled ? "#16a34a" : T.soft,
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {gpuInfo.renderer}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>
              {gpuInfo.vendor} · Your GPU details stay on this device
            </div>
          </div>
        </div>
      </div>

      {/* Toggle */}
      <div style={{ ...sectionStyle, textAlign: "center" }}>
        <button
          onClick={toggle}
          style={{
            width: "100%",
            background: enabled ? T.pop : T.ink,
            color: T.paper,
            border: "none",
            padding: "16px 24px",
            borderRadius: 14,
            fontSize: 17,
            fontWeight: 700,
            cursor: "pointer",
            transition: "background 0.2s",
          }}
        >
          {enabled ? "Stop Contributing" : "Start Contributing"}
        </button>
        <div
          className="mono"
          style={{ fontSize: 11, color: T.soft, marginTop: 8, letterSpacing: "0.08em" }}
        >
          {enabled
            ? "Your GPU is contributing compute power"
            : "Lend your GPU to earn Taste Coins"}
        </div>
      </div>

      {/* Activity */}
      {enabled && (
        <div style={sectionStyle}>
          <div
            className="mono"
            style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
          >
            ACTIVITY
          </div>
          {currentJob ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: `3px solid ${T.pop}`,
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Working on job...
                <span style={{ color: T.soft, marginLeft: 6 }}>
                  +{currentJob.coins_reward} coins
                </span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: T.soft }}>
              Waiting for jobs...
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={sectionStyle}>
        <div
          className="mono"
          style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10 }}
        >
          COMPUTE STATS
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div className="disp" style={{ fontSize: 28, fontWeight: 700 }}>
              {jobsThisSession}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>This session</div>
          </div>
          <div>
            <div className="disp" style={{ fontSize: 28, fontWeight: 700 }}>
              {totalJobs}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>All-time jobs</div>
          </div>
          <div>
            <div className="disp" style={{ fontSize: 28, fontWeight: 700, color: "#d97706" }}>
              {coinsThisSession}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Coins (session)</div>
          </div>
          <div>
            <div className="disp" style={{ fontSize: 28, fontWeight: 700, color: "#d97706" }}>
              {totalCoins}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Coins (total)</div>
          </div>
        </div>
      </div>

      {/* Membership */}
      <MembershipGate membership={membership} />

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
