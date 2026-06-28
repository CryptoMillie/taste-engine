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

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ComputeDashboard({
  gpuAvailable,
  gpuInfo,
  gpuClass,
  enabled,
  toggle,
  starting,
  error,
  status,
  currentJob,
  jobsThisSession,
  coinsThisSession,
  usdcThisSession,
  workerStats,
  membership,
  sessionElapsed,
  earningsRate,
}) {
  const totalJobs = workerStats?.total_jobs || 0;
  const totalUsdc = Number(workerStats?.total_usdc_earned || 0);
  const totalCoins = workerStats?.total_coins_earned || 0;

  // Projected earnings
  const proj4hr = (earningsRate.usdcPerHour * 4).toFixed(2);
  const proj8hr = (earningsRate.usdcPerHour * 8).toFixed(2);
  const proj24hr = (earningsRate.usdcPerHour * 24).toFixed(2);

  // Live session projected (based on rate, not actual jobs — shows potential)
  const sessionHours = sessionElapsed / 3600;
  const sessionProjectedUsdc = enabled
    ? Math.max(usdcThisSession, sessionHours * earningsRate.usdcPerHour)
    : usdcThisSession;

  if (!gpuAvailable) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 22px 52px" }}>
        <h2 className="disp" style={{ fontSize: 42, fontWeight: 800, marginBottom: 8 }}>
          Earn
        </h2>
        <p style={{ fontSize: 15, color: T.soft, marginBottom: 24 }}>
          Turn your idle GPU into real USDC earnings
        </p>
        <div style={sectionStyle}>
          <div style={{ fontSize: 15, color: T.pop, fontWeight: 600 }}>
            WebGPU is not available in this browser.
          </div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 8 }}>
            Use Chrome 113+ or Edge 113+ with a dedicated GPU to start earning.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 22px 52px" }}>
      <h2 className="disp" style={{ fontSize: 42, fontWeight: 800, marginBottom: 4 }}>
        Earn
      </h2>
      <p style={{ fontSize: 15, color: T.soft, marginBottom: 20 }}>
        Lend your GPU, earn USDC + mine Taste Coins
      </p>

      {/* Earnings Rate Hero */}
      <div style={{
        ...sectionStyle,
        background: enabled ? "#16a34a" : T.ink,
        color: T.paper,
        border: "none",
        textAlign: "center",
        padding: "28px 24px",
      }}>
        <div className="mono" style={{
          fontSize: 10, letterSpacing: "0.16em", opacity: 0.7, marginBottom: 8,
        }}>
          YOUR EARNING RATE
        </div>
        <div className="disp" style={{ fontSize: 48, fontWeight: 800 }}>
          ${earningsRate.usdcPerHour.toFixed(2)}<span style={{ fontSize: 20, fontWeight: 400 }}>/hr</span>
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
          + {earningsRate.coinsPerHour} Taste Coins/hr
        </div>
        <div className="mono" style={{
          fontSize: 10, opacity: 0.5, marginTop: 8, letterSpacing: "0.08em",
        }}>
          GPU: {gpuClass.toUpperCase()} TIER
        </div>
      </div>

      {/* Projections */}
      {!enabled && (
        <div style={sectionStyle}>
          <div className="mono" style={{
            fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 12,
          }}>
            IF YOU LEAVE IT RUNNING
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {[
              { label: "4 hours", usdc: proj4hr },
              { label: "8 hours", usdc: proj8hr },
              { label: "24 hours", usdc: proj24hr },
            ].map((p) => (
              <div key={p.label} style={{ textAlign: "center", flex: 1 }}>
                <div className="disp" style={{ fontSize: 24, fontWeight: 700, color: "#16a34a" }}>
                  ${p.usdc}
                </div>
                <div style={{ fontSize: 12, color: T.soft }}>{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toggle */}
      <div style={{ ...sectionStyle, textAlign: "center" }}>
        <button
          onClick={toggle}
          disabled={starting}
          style={{
            width: "100%",
            background: starting ? T.soft : enabled ? T.pop : "#16a34a",
            color: T.paper,
            border: "none",
            padding: "18px 24px",
            borderRadius: 14,
            fontSize: 18,
            fontWeight: 700,
            cursor: starting ? "wait" : "pointer",
            transition: "background 0.2s",
            opacity: starting ? 0.7 : 1,
          }}
        >
          {starting ? "Connecting..." : enabled ? "Stop Earning" : "Start Earning"}
        </button>
        {!enabled && !starting && !error && (
          <div style={{ fontSize: 12, color: T.soft, marginTop: 8 }}>
            Runs in the background while you browse. Stop anytime.
          </div>
        )}
        {error && (
          <div style={{
            fontSize: 13, color: T.pop, marginTop: 10,
            padding: "10px 14px", background: "#fff0ee",
            borderRadius: 10, textAlign: "left",
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Live Session */}
      {enabled && (
        <div style={sectionStyle}>
          <div className="mono" style={{
            fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 12,
          }}>
            LIVE SESSION
          </div>

          {/* Session timer + earnings */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div className="disp" style={{ fontSize: 28, fontWeight: 700 }}>
                {formatTime(sessionElapsed)}
              </div>
              <div style={{ fontSize: 12, color: T.soft }}>Uptime</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="disp" style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>
                ${sessionProjectedUsdc.toFixed(4)}
              </div>
              <div style={{ fontSize: 12, color: T.soft }}>USDC earned</div>
            </div>
          </div>

          {/* Activity */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px", background: T.paper, borderRadius: 12,
          }}>
            {currentJob ? (
              <>
                <div style={{
                  width: 14, height: 14,
                  border: `3px solid #16a34a`,
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  flexShrink: 0,
                }} />
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  Processing job...
                  <span style={{ color: "#16a34a", marginLeft: 6 }}>
                    +${Number(currentJob.usdc_reward || 0.0005).toFixed(4)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: 10, height: 10,
                  borderRadius: "50%",
                  background: "#16a34a",
                  animation: "pulse 2s ease infinite",
                  flexShrink: 0,
                }} />
                <div style={{ fontSize: 13, color: T.soft }}>
                  Online — waiting for jobs
                </div>
              </>
            )}
          </div>

          {/* Session stats row */}
          <div style={{ display: "flex", gap: 20, marginTop: 14 }}>
            <div>
              <span style={{ fontWeight: 600 }}>{jobsThisSession}</span>
              <span style={{ fontSize: 12, color: T.soft, marginLeft: 4 }}>jobs</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, color: "#d97706" }}>{coinsThisSession}</span>
              <span style={{ fontSize: 12, color: T.soft, marginLeft: 4 }}>coins mined</span>
            </div>
          </div>
        </div>
      )}

      {/* All-time Stats */}
      <div style={sectionStyle}>
        <div className="mono" style={{
          fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 12,
        }}>
          ALL-TIME EARNINGS
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div className="disp" style={{ fontSize: 32, fontWeight: 800, color: "#16a34a" }}>
              ${totalUsdc.toFixed(4)}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>USDC earned</div>
          </div>
          <div>
            <div className="disp" style={{ fontSize: 32, fontWeight: 800, color: "#d97706" }}>
              {totalCoins}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Taste Coins mined</div>
          </div>
          <div>
            <div className="disp" style={{ fontSize: 32, fontWeight: 800 }}>
              {totalJobs}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Jobs done</div>
          </div>
        </div>
        {totalUsdc > 0 && (
          <div style={{
            marginTop: 14, padding: "12px 14px",
            background: T.paper, borderRadius: 10,
            fontSize: 12,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: T.soft }}>Gross earned</span>
              <span style={{ fontWeight: 600 }}>${totalUsdc.toFixed(4)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: T.soft }}>Platform fee (10%)</span>
              <span style={{ color: T.pop }}>-${(totalUsdc * 0.10).toFixed(4)}</span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              borderTop: `1px solid ${T.line}`, paddingTop: 4,
            }}>
              <span style={{ fontWeight: 600 }}>You receive</span>
              <span style={{ fontWeight: 700, color: "#16a34a" }}>
                ${(totalUsdc * 0.90).toFixed(4)}
              </span>
            </div>
            <div style={{ color: T.soft, marginTop: 6, fontSize: 11 }}>
              Paid in USDC on Base. Taste Coins are fee-free.
            </div>
          </div>
        )}
      </div>

      {/* GPU info — local only */}
      <div style={sectionStyle}>
        <div className="mono" style={{
          fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10,
        }}>
          YOUR DEVICE
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: enabled ? "#16a34a" : T.soft, flexShrink: 0,
          }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {gpuInfo.renderer}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>
              {gpuInfo.vendor} · {gpuClass.toUpperCase()} tier · Details stay on-device
            </div>
          </div>
        </div>
      </div>

      {/* Membership */}
      <MembershipGate membership={membership} earningsRate={earningsRate} />

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </main>
  );
}
