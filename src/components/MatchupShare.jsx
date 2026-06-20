import React from "react";
import { Link2 } from "lucide-react";
import { T } from "../theme";

export const socialBtnStyle = (bg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: bg,
  border: "none",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: 99,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

export default function MatchupShare({ pair, onCopyLink, heading, urlBuilder }) {
  const defaultUrl = `${window.location.origin}${window.location.pathname}?challenge=${pair[0].id},${pair[1].id}`;
  const shareUrl = urlBuilder ? urlBuilder(pair) : defaultUrl;
  const text = `${pair[0].name} vs ${pair[1].name} — which do you prefer?`;

  const shareX = () =>
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, "_blank");
  const shareFB = () =>
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(text)}`, "_blank");
  const shareWA = () =>
    window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + shareUrl)}`, "_blank");
  const shareTG = () =>
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`, "_blank");
  const shareReddit = () =>
    window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(text)}`, "_blank");

  return (
    <div style={{ textAlign: "center", marginTop: 22 }}>
      <div
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.16em", color: T.soft, marginBottom: 10 }}
      >
        {heading || "CHALLENGE A FRIEND"}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={onCopyLink} style={socialBtnStyle(T.ink)}>
          <Link2 size={13} /> Copy Link
        </button>
        <button onClick={shareX} style={socialBtnStyle("#000000")}>
          𝕏
        </button>
        <button onClick={shareFB} style={socialBtnStyle("#1877F2")}>
          Facebook
        </button>
        <button onClick={shareWA} style={socialBtnStyle("#25D366")}>
          WhatsApp
        </button>
        <button onClick={shareTG} style={socialBtnStyle("#26A5E4")}>
          Telegram
        </button>
        <button onClick={shareReddit} style={socialBtnStyle("#FF4500")}>
          Reddit
        </button>
      </div>
    </div>
  );
}
