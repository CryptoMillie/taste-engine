import React, { useState, useEffect } from "react";
import { T } from "../theme";
import MembershipGate from "./MembershipGate";
import { fetchRlhfStats } from "../api/reputation";

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
  userId,
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
  modelStatus,
  modelProgress,
  networkStats,
  trustScore,
  verificationHistory,
  shardModels,
  shardStats,
  userShardJobs,
}) {
  const [rlhfStats, setRlhfStats] = useState({ highQualityVotes: 0, dividendsEarned: 0, optedIn: true });
  useEffect(() => {
    if (userId) fetchRlhfStats(userId).then(setRlhfStats);
  }, [userId]);

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

      {/* Model Loading Progress */}
      {enabled && modelStatus && modelStatus !== "ready" && modelStatus !== "idle" && (
        <div style={sectionStyle}>
          <div className="mono" style={{
            fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10,
          }}>
            {modelStatus === "error" ? "MODEL ERROR" : "LOADING AI MODEL"}
          </div>
          {modelStatus !== "error" ? (
            <>
              <div style={{
                width: "100%", height: 8, background: T.line,
                borderRadius: 4, overflow: "hidden", marginBottom: 8,
              }}>
                <div style={{
                  width: `${modelProgress}%`, height: "100%",
                  background: "#16a34a", borderRadius: 4,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <div style={{ fontSize: 12, color: T.soft }}>
                {modelStatus === "downloading"
                  ? `Downloading model... ${modelProgress}%`
                  : `Loading into GPU... ${modelProgress}%`}
              </div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 4 }}>
                ~1.2 GB, cached after first download
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: T.pop }}>
              Failed to load model. Your GPU may not support WebLLM.
            </div>
          )}
        </div>
      )}

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
                  {currentJob.job_type === "inference" ? "Running inference..." :
                   currentJob.job_type === "benchmark" ? "Running benchmark..." :
                   "Processing job..."}
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

      {/* Verification Trust Score */}
      {trustScore && (
        <div style={sectionStyle}>
          <div className="mono" style={{
            fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 12,
          }}>
            VERIFICATION TRUST SCORE
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
            <div className="disp" style={{
              fontSize: 48, fontWeight: 800,
              color: trustScore.score >= 70 ? "#16a34a" : trustScore.score >= 40 ? "#d97706" : "#dc2626",
            }}>
              {trustScore.score}
            </div>
            <div style={{ fontSize: 13, color: T.soft }}>/100</div>
          </div>
          {/* Progress bar */}
          <div style={{
            width: "100%", height: 8, background: T.line,
            borderRadius: 4, overflow: "hidden", marginBottom: 12,
          }}>
            <div style={{
              width: `${trustScore.score}%`, height: "100%",
              background: trustScore.score >= 70 ? "#16a34a" : trustScore.score >= 40 ? "#d97706" : "#dc2626",
              borderRadius: 4, transition: "width 0.3s ease",
            }} />
          </div>
          {/* Pass/fail counts */}
          <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
            <div>
              <span style={{ fontWeight: 600, color: "#16a34a" }}>{trustScore.pass}</span>
              <span style={{ fontSize: 12, color: T.soft, marginLeft: 4 }}>passed</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, color: "#dc2626" }}>{trustScore.fail}</span>
              <span style={{ fontSize: 12, color: T.soft, marginLeft: 4 }}>failed</span>
            </div>
            <div>
              <span style={{ fontWeight: 600 }}>{trustScore.count}</span>
              <span style={{ fontSize: 12, color: T.soft, marginLeft: 4 }}>total checks</span>
            </div>
          </div>
          {/* Info box */}
          <div style={{
            padding: "10px 14px", background: T.paper, borderRadius: 10,
            fontSize: 12, color: T.soft, marginBottom: 14,
          }}>
            Powered by Verathos (Bittensor SN96). ~15% of completed jobs are randomly
            replayed through cryptographically-verified inference to ensure honest computation.
          </div>
          {/* Recent verification history */}
          {verificationHistory && verificationHistory.length > 0 && (
            <div>
              <div className="mono" style={{
                fontSize: 10, color: T.soft, letterSpacing: "0.12em", marginBottom: 8,
              }}>
                RECENT CHECKS
              </div>
              {verificationHistory.map((v) => (
                <div key={v.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0", borderBottom: `1px solid ${T.line}`,
                  fontSize: 13,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: v.verdict === "pass" ? "#16a34a" : v.verdict === "fail" ? "#dc2626" : "#d97706",
                    }} />
                    <span style={{
                      fontWeight: 600, textTransform: "capitalize",
                      color: v.verdict === "pass" ? "#16a34a" : v.verdict === "fail" ? "#dc2626" : "#d97706",
                    }}>
                      {v.verdict}
                    </span>
                    {v.similarity_score != null && (
                      <span style={{ color: T.soft, fontSize: 12 }}>
                        {(Number(v.similarity_score) * 100).toFixed(1)}% similar
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: T.soft }}>
                    {new Date(v.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Network Stats */}
      {networkStats && (
        <div style={{
          ...sectionStyle,
          background: T.ink,
          color: T.paper,
          border: "none",
        }}>
          <div className="mono" style={{
            fontSize: 10, letterSpacing: "0.16em", marginBottom: 12, opacity: 0.5,
          }}>
            NETWORK
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>
                {networkStats.workers_online || 0}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>Workers online</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700, color: "#facc15" }}>
                {networkStats.workers_busy || 0}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>Busy</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700 }}>
                {networkStats.jobs_pending || 0}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>Jobs queued</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700 }}>
                {networkStats.jobs_completed || 0}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>Completed</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>
                ${Number(networkStats.total_usdc_paid || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>USDC paid out</div>
            </div>
            {networkStats.avg_trust_score != null && (
              <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
                <div className="disp" style={{ fontSize: 24, fontWeight: 700, color: "#60a5fa" }}>
                  {Math.round(Number(networkStats.avg_trust_score))}
                </div>
                <div style={{ fontSize: 10, opacity: 0.6 }}>Avg Trust</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shard Frontier Models */}
      {shardModels && shardModels.length > 0 && (
        <div style={sectionStyle}>
          <div className="mono" style={{
            fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 12,
          }}>
            SHARD FRONTIER MODELS
          </div>
          {shardModels.map((m) => (
            <div key={m.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderBottom: `1px solid ${T.line}`,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.model_name}</div>
                {m.description && (
                  <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>{m.description}</div>
                )}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#16a34a",
                background: "#dcfce7", padding: "3px 8px", borderRadius: 6,
                letterSpacing: "0.08em",
              }}>
                ACTIVE
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: T.soft, marginTop: 10 }}>
            Pipeline-parallel inference via Shard distributed GPU network
          </div>
        </div>
      )}

      {/* Shard Network Stats */}
      {shardStats && (
        <div style={{
          ...sectionStyle,
          background: "#7c3aed",
          color: T.paper,
          border: "none",
        }}>
          <div className="mono" style={{
            fontSize: 10, letterSpacing: "0.16em", marginBottom: 12, opacity: 0.5,
          }}>
            SHARD NETWORK
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700, color: "#c4b5fd" }}>
                {shardStats.jobs_completed || 0}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>Jobs completed</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700, color: "#c4b5fd" }}>
                {shardStats.avg_latency_ms ? `${shardStats.avg_latency_ms}ms` : "—"}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>Avg latency</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>
                {shardStats.receipts_verified || 0}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>Receipts verified</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700, color: "#c4b5fd" }}>
                {shardStats.models_active || 0}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>Models active</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Shard Jobs */}
      {userShardJobs && userShardJobs.length > 0 && (
        <div style={sectionStyle}>
          <div className="mono" style={{
            fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 12,
          }}>
            YOUR RECENT SHARD REQUESTS
          </div>
          {userShardJobs.map((j) => (
            <div key={j.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: `1px solid ${T.line}`,
              fontSize: 13,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: j.status === "completed" ? "#16a34a" : j.status === "running" ? "#d97706" : "#dc2626",
                }} />
                <span style={{ fontWeight: 600 }}>{j.model_name}</span>
                {j.latency_ms && (
                  <span style={{ color: T.soft, fontSize: 12 }}>{j.latency_ms}ms</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {j.receipt_verification_status === "verified" && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: "#16a34a",
                    background: "#dcfce7", padding: "2px 6px", borderRadius: 4,
                  }}>
                    VERIFIED
                  </span>
                )}
                {j.receipt_verification_status === "failed" && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: "#dc2626",
                    background: "#fef2f2", padding: "2px 6px", borderRadius: 4,
                  }}>
                    UNVERIFIED
                  </span>
                )}
                <span style={{ fontSize: 11, color: T.soft }}>
                  {new Date(j.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Your Data — RLHF contributions */}
      <div style={sectionStyle}>
        <div className="mono" style={{
          fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 12,
        }}>
          YOUR DATA
        </div>
        <div style={{ fontSize: 13, color: T.soft, marginBottom: 14, lineHeight: 1.5 }}>
          Your preference votes train AI models via RLHF. You earn dividends when data is purchased.
        </div>
        <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
          <div>
            <div className="disp" style={{ fontSize: 28, fontWeight: 700, color: "#7c3aed" }}>
              {rlhfStats.highQualityVotes}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Preference pairs</div>
          </div>
          <div>
            <div className="disp" style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>
              ${rlhfStats.dividendsEarned.toFixed(4)}
            </div>
            <div style={{ fontSize: 12, color: T.soft }}>Dividends earned</div>
          </div>
        </div>
        {(() => {
          const v = rlhfStats.highQualityVotes;
          const tier = v >= 100 ? { label: "GOLD", color: "#d97706", bg: "#fef3c7" }
            : v >= 25 ? { label: "SILVER", color: "#6b7280", bg: "#f3f4f6" }
            : { label: "BRONZE", color: "#92400e", bg: "#fef3c7" };
          return (
            <span className="mono" style={{
              fontSize: 10, fontWeight: 700, color: tier.color,
              background: tier.bg, padding: "3px 10px", borderRadius: 6,
              letterSpacing: "0.08em",
            }}>
              {tier.label} CONTRIBUTOR
            </span>
          );
        })()}
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

      {/* Native Worker */}
      <div style={{
        ...sectionStyle,
        background: "linear-gradient(135deg, #1e1b4b, #312e81)",
        color: T.paper,
        border: "none",
      }}>
        <div className="mono" style={{
          fontSize: 10, letterSpacing: "0.16em", marginBottom: 12, opacity: 0.5,
        }}>
          EARN MORE WITH NATIVE GPU
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              Native Worker
            </div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10, lineHeight: 1.5 }}>
              Run a 27B model natively on your GPU via terminal. Earns $0.10–$0.14 per job
              — higher pay than browser workers.
            </div>
            <div style={{
              fontSize: 12, opacity: 0.6, marginBottom: 12,
              padding: "8px 10px", background: "rgba(255,255,255,0.08)", borderRadius: 8,
            }}>
              Requires: dedicated GPU (RTX 3060+), ~18 GB VRAM, terminal access
            </div>
          </div>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minWidth: 90, gap: 4,
          }}>
            <div className="disp" style={{ fontSize: 28, fontWeight: 800, color: "#4ade80" }}>
              $0.14
            </div>
            <div style={{ fontSize: 10, opacity: 0.6 }}>/job</div>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div className="mono" style={{ fontSize: 10, opacity: 0.5, marginBottom: 6, letterSpacing: "0.08em" }}>
            QUICK START
          </div>
          <code style={{
            display: "block", fontSize: 11, background: "rgba(0,0,0,0.3)",
            padding: "10px 12px", borderRadius: 8, wordBreak: "break-all",
            color: "#c4b5fd", lineHeight: 1.6,
          }}>
            pip install c0mpute{"\n"}c0mpute worker start
          </code>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="https://c0mpute.ai/earn"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block", background: "#7c3aed", color: T.paper,
              padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              textDecoration: "none", textAlign: "center", flex: 1,
            }}
          >
            Set Up Native Worker
          </a>
          <a
            href="https://docs.c0mpute.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block", background: "rgba(255,255,255,0.1)", color: T.paper,
              padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              textDecoration: "none", textAlign: "center",
            }}
          >
            Docs
          </a>
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 10 }}>
          Earn more by running frontier models on your dedicated GPU.
        </div>
      </div>

      {/* Browser vs Native comparison */}
      <div style={sectionStyle}>
        <div className="mono" style={{
          fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 12,
        }}>
          BROWSER vs NATIVE
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{
            flex: 1, padding: "12px 14px", background: T.paper, borderRadius: 10,
            border: `1px solid ${T.line}`,
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Browser Worker</div>
            <div style={{ fontSize: 12, color: T.soft, lineHeight: 1.5 }}>
              Runs in a tab via WebGPU. Lower earnings, zero setup. Good for any GPU.
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#d97706", marginTop: 8 }}>
              ~$0.07/job
            </div>
          </div>
          <div style={{
            flex: 1, padding: "12px 14px", background: T.paper, borderRadius: 10,
            border: "1px solid #7c3aed",
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "#7c3aed" }}>Native Worker</div>
            <div style={{ fontSize: 12, color: T.soft, lineHeight: 1.5 }}>
              Runs 27B model natively. Higher earnings, needs dedicated GPU + terminal.
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#16a34a", marginTop: 8 }}>
              $0.10–$0.14/job
            </div>
          </div>
        </div>
      </div>

      {/* API Access */}
      <div style={sectionStyle}>
        <div className="mono" style={{
          fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 10,
        }}>
          API ACCESS
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          OpenAI-compatible endpoint
        </div>
        <code style={{
          display: "block", fontSize: 12, background: T.paper,
          padding: "10px 12px", borderRadius: 10, wordBreak: "break-all",
          marginBottom: 10,
        }}>
          POST /functions/v1/v1-chat-completions
        </code>
        <div style={{ fontSize: 12, color: T.soft, marginBottom: 8 }}>
          Use your API key to send inference requests. Workers on the network
          process them and earn USDC.
        </div>
        <div style={{ fontSize: 12, color: T.soft }}>
          Manage API keys in your <strong>Profile</strong> page.
        </div>
      </div>

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
