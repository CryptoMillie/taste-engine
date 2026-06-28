import React, { useState, useEffect, useCallback } from "react";
import { T } from "../theme";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * API Key management component.
 * Create, list, and deactivate API keys for the compute marketplace.
 */
export default function ApiKeys({ userId, session }) {
  const [keys, setKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const token = session?.access_token;

  const fetchKeys = useCallback(async () => {
    if (!token || !SUPABASE_URL) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/api-keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = async () => {
    if (!token || !SUPABASE_URL || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/api-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newKeyName || "Default" }),
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedKey(data.key);
        setCopied(false);
        setNewKeyName("");
        fetchKeys();
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const deactivateKey = async (id) => {
    if (!token || !SUPABASE_URL) return;
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/api-keys`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
      fetchKeys();
    } catch { /* ignore */ }
  };

  const copyKey = () => {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey).then(() => setCopied(true));
    }
  };

  const sectionStyle = {
    background: T.card,
    border: `1px solid ${T.line}`,
    borderRadius: 18,
    padding: "20px 24px",
    marginBottom: 16,
  };

  const curlExample = SUPABASE_URL
    ? `curl ${SUPABASE_URL}/functions/v1/v1-chat-completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello"}]}'`
    : "";

  return (
    <div style={sectionStyle}>
      <div
        className="mono"
        style={{ fontSize: 10, color: T.soft, letterSpacing: "0.16em", marginBottom: 12 }}
      >
        API KEYS
      </div>

      {/* Revealed key (shown once after creation) */}
      {revealedKey && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: 12, padding: "14px 16px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 6 }}>
            New API key created — copy it now, it won't be shown again
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{
              flex: 1, fontSize: 11, background: "#fff",
              padding: "8px 10px", borderRadius: 8,
              wordBreak: "break-all", border: "1px solid #d1fae5",
            }}>
              {revealedKey}
            </code>
            <button
              onClick={copyKey}
              style={{
                background: copied ? "#16a34a" : T.ink,
                color: T.paper, border: "none",
                padding: "8px 14px", borderRadius: 10,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Create key */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Key name (optional)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          style={{
            flex: 1, padding: "9px 12px", borderRadius: 10,
            border: `1px solid ${T.line}`, fontSize: 13, outline: "none",
          }}
        />
        <button
          onClick={createKey}
          disabled={loading}
          style={{
            background: T.ink, color: T.paper,
            border: "none", padding: "9px 16px",
            borderRadius: 10, fontSize: 13,
            fontWeight: 600, cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          Create Key
        </button>
      </div>

      {/* Key list */}
      {keys.length > 0 ? (
        <div>
          {keys.map((k) => (
            <div
              key={k.id}
              style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", padding: "10px 0",
                borderBottom: `1px solid ${T.line}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {k.name}
                  {!k.is_active && (
                    <span style={{
                      fontSize: 10, color: T.pop, marginLeft: 8,
                      fontWeight: 400,
                    }}>
                      INACTIVE
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: T.soft }}>
                  <code>{k.key_prefix}...</code>
                  {" · "}
                  {k.usage_count} requests
                  {" · "}
                  {k.usage_tokens} tokens
                </div>
              </div>
              {k.is_active && (
                <button
                  onClick={() => deactivateKey(k.id)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${T.line}`,
                    padding: "4px 10px", borderRadius: 8,
                    fontSize: 11, cursor: "pointer",
                    color: T.pop,
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: T.soft }}>
          No API keys yet. Create one to access the compute API.
        </div>
      )}

      {/* Curl example */}
      {curlExample && (
        <div style={{ marginTop: 16 }}>
          <div className="mono" style={{
            fontSize: 9, color: T.soft, letterSpacing: "0.12em", marginBottom: 6,
          }}>
            EXAMPLE
          </div>
          <pre style={{
            fontSize: 10, background: T.paper,
            padding: "10px 12px", borderRadius: 10,
            overflow: "auto", whiteSpace: "pre-wrap",
            wordBreak: "break-all", lineHeight: 1.5,
          }}>
            {curlExample}
          </pre>
        </div>
      )}
    </div>
  );
}
