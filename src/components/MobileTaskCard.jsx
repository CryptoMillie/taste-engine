import React from "react";
import { T } from "../theme";

/**
 * Mobile micro-task card for preference voting, label verification, etc.
 * Large touch targets (48px+), tap to choose, skip button.
 */
export default function MobileTaskCard({ task, onSubmit, onSkip }) {
  if (!task) return null;

  const payload = typeof task.payload === "string" ? JSON.parse(task.payload) : task.payload;
  const taskType = task.task_type || payload?.type || "preference-pair";

  if (taskType === "preference-pair") {
    return (
      <div style={{
        background: T.card,
        border: `1px solid ${T.line}`,
        borderRadius: 18,
        padding: "20px 16px",
        marginBottom: 12,
      }}>
        <div className="mono" style={{
          fontSize: 10, color: T.soft, letterSpacing: "0.12em", marginBottom: 12,
          textAlign: "center",
        }}>
          WHICH DO YOU PREFER?
        </div>

        {payload?.context && (
          <div style={{
            fontSize: 13, color: T.soft, textAlign: "center",
            marginBottom: 14,
          }}>
            {payload.context}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          {/* Option A */}
          <button
            onClick={() => onSubmit(task.id, "A")}
            style={{
              flex: 1,
              background: T.paper,
              border: `2px solid ${T.line}`,
              borderRadius: 14,
              padding: "20px 14px",
              cursor: "pointer",
              minHeight: 80,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 0.15s, transform 0.1s",
            }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            onPointerLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {payload?.image_a && (
              <img
                src={payload.image_a}
                alt="Option A"
                style={{
                  width: "100%", maxHeight: 120, objectFit: "cover",
                  borderRadius: 8, marginBottom: 8,
                }}
              />
            )}
            <div style={{ fontSize: 14, fontWeight: 600, textAlign: "center" }}>
              {payload?.option_a || "Option A"}
            </div>
          </button>

          {/* Option B */}
          <button
            onClick={() => onSubmit(task.id, "B")}
            style={{
              flex: 1,
              background: T.paper,
              border: `2px solid ${T.line}`,
              borderRadius: 14,
              padding: "20px 14px",
              cursor: "pointer",
              minHeight: 80,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 0.15s, transform 0.1s",
            }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            onPointerLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {payload?.image_b && (
              <img
                src={payload.image_b}
                alt="Option B"
                style={{
                  width: "100%", maxHeight: 120, objectFit: "cover",
                  borderRadius: 8, marginBottom: 8,
                }}
              />
            )}
            <div style={{ fontSize: 14, fontWeight: 600, textAlign: "center" }}>
              {payload?.option_b || "Option B"}
            </div>
          </button>
        </div>

        {/* Skip */}
        <button
          onClick={() => onSkip(task.id)}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            color: T.soft,
            fontSize: 13,
            padding: "10px 0",
            cursor: "pointer",
          }}
        >
          Skip this one
        </button>
      </div>
    );
  }

  if (taskType === "label-verify") {
    return (
      <div style={{
        background: T.card,
        border: `1px solid ${T.line}`,
        borderRadius: 18,
        padding: "20px 16px",
        marginBottom: 12,
      }}>
        <div className="mono" style={{
          fontSize: 10, color: T.soft, letterSpacing: "0.12em", marginBottom: 12,
          textAlign: "center",
        }}>
          IS THIS LABEL CORRECT?
        </div>

        <div style={{
          background: T.paper, borderRadius: 12, padding: "16px",
          marginBottom: 14, textAlign: "center",
        }}>
          {payload?.image && (
            <img
              src={payload.image}
              alt="Item"
              style={{
                maxWidth: "100%", maxHeight: 150, objectFit: "contain",
                borderRadius: 8, marginBottom: 10,
              }}
            />
          )}
          <div style={{ fontSize: 16, fontWeight: 600 }}>{payload?.item_name}</div>
          <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
            Label: <strong>{payload?.proposed_label}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button
            onClick={() => onSubmit(task.id, "correct")}
            style={{
              flex: 1, background: "#16a34a", color: "#fff", border: "none",
              borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 600,
              cursor: "pointer", minHeight: 48,
            }}
          >
            Correct
          </button>
          <button
            onClick={() => onSubmit(task.id, "incorrect")}
            style={{
              flex: 1, background: "#dc2626", color: "#fff", border: "none",
              borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 600,
              cursor: "pointer", minHeight: 48,
            }}
          >
            Wrong
          </button>
        </div>

        <button
          onClick={() => onSkip(task.id)}
          style={{
            width: "100%", background: "transparent", border: "none",
            color: T.soft, fontSize: 13, padding: "10px 0", cursor: "pointer",
          }}
        >
          Skip
        </button>
      </div>
    );
  }

  if (taskType === "output-rating") {
    return (
      <div style={{
        background: T.card,
        border: `1px solid ${T.line}`,
        borderRadius: 18,
        padding: "20px 16px",
        marginBottom: 12,
      }}>
        <div className="mono" style={{
          fontSize: 10, color: T.soft, letterSpacing: "0.12em", marginBottom: 12,
          textAlign: "center",
        }}>
          RATE THIS OUTPUT
        </div>

        <div style={{
          background: T.paper, borderRadius: 12, padding: "14px",
          marginBottom: 14, fontSize: 13, lineHeight: 1.5,
        }}>
          {payload?.output_text}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10, justifyContent: "center" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => onSubmit(task.id, String(n))}
              style={{
                width: 48, height: 48, borderRadius: 12, border: `2px solid ${T.line}`,
                background: T.paper, fontSize: 18, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          onClick={() => onSkip(task.id)}
          style={{
            width: "100%", background: "transparent", border: "none",
            color: T.soft, fontSize: 13, padding: "10px 0", cursor: "pointer",
          }}
        >
          Skip
        </button>
      </div>
    );
  }

  // Fallback for unknown task types
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.line}`, borderRadius: 18,
      padding: "20px 16px", marginBottom: 12, textAlign: "center",
    }}>
      <div style={{ fontSize: 13, color: T.soft }}>Unknown task type: {taskType}</div>
      <button
        onClick={() => onSkip(task.id)}
        style={{
          marginTop: 10, background: "transparent", border: "none",
          color: T.soft, fontSize: 13, padding: "10px 0", cursor: "pointer",
        }}
      >
        Skip
      </button>
    </div>
  );
}
