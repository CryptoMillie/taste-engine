import React, { useRef, useEffect, useState, useCallback } from "react";
import { ArrowLeft, Copy, Download, Share2 } from "lucide-react";
import { T } from "../theme";
import {
  getCategoryStats,
  getRadarData,
  getArchetype,
  getTopAndRarest,
} from "../engine/taste-profile";
import {
  fetchGlobalCategoryAverages,
  computeTasteTwinPercent,
} from "../api/stats";

const CARD_W = 600;
const CARD_H = 900;
const MIN_VOTES = 20;

/**
 * Draw the full Taste DNA card onto a canvas.
 */
function drawCard(ctx, { radarData, archetype, votes, contrarianPct, topPick, rarestPick, tasteTwin }) {
  const w = CARD_W;
  const h = CARD_H;

  // Background
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, w, h);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(255,59,31,0.06)");
  grad.addColorStop(0.5, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(255,59,31,0.03)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Header branding
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 28px 'Bricolage Grotesque', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("TASTE", 40, 56);
  ctx.fillStyle = "#6B6459";
  ctx.font = "400 12px 'Space Mono', monospace";
  ctx.fillText("ENGINE", 140, 56);

  // Horizontal line
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 76);
  ctx.lineTo(w - 40, 76);
  ctx.stroke();

  // Radar chart
  const cx = w / 2;
  const cy = 240;
  const radius = 120;
  const points = radarData.length || 5;

  // Grid rings
  for (let ring = 1; ring <= 3; ring++) {
    const r = (radius * ring) / 3;
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Axis lines
  for (let i = 0; i < points; i++) {
    const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.stroke();
  }

  // Data polygon
  if (radarData.length > 0) {
    ctx.beginPath();
    radarData.forEach((d, i) => {
      const angle = (Math.PI * 2 * i) / radarData.length - Math.PI / 2;
      const r = radius * Math.max(d.value, 0.05);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(255,59,31,0.25)";
    ctx.fill();
    ctx.strokeStyle = T.pop;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Data points + labels
    radarData.forEach((d, i) => {
      const angle = (Math.PI * 2 * i) / radarData.length - Math.PI / 2;
      const r = radius * Math.max(d.value, 0.05);
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);

      // Point dot
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = T.pop;
      ctx.fill();

      // Category label
      const labelR = radius + 24;
      const lx = cx + labelR * Math.cos(angle);
      const ly = cy + labelR * Math.sin(angle);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "400 10px 'Space Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.cat.toUpperCase(), lx, ly);
    });
  }

  // Archetype label with glow
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowColor = T.pop;
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 36px 'Bricolage Grotesque', sans-serif";
  ctx.fillText(archetype, cx, 400);
  ctx.shadowBlur = 0;

  // Thin divider
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(40, 460);
  ctx.lineTo(w - 40, 460);
  ctx.stroke();

  // Stats grid 2x2
  const statsY = 490;
  const col1 = 160;
  const col2 = w - 160;

  function drawStat(x, y, label, value) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "400 10px 'Space Mono', monospace";
    ctx.fillText(label, x, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 24px 'Bricolage Grotesque', sans-serif";
    ctx.fillText(value, x, y + 20);
  }

  drawStat(col1, statsY, "TOTAL VOTES", String(votes));
  drawStat(col2, statsY, "CONTRARIAN", `${contrarianPct}%`);
  drawStat(col1, statsY + 80, "TOP PICK", topPick || "—");
  drawStat(col2, statsY + 80, "RAREST PICK", rarestPick || "—");

  // Taste twin
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "400 11px 'Space Mono', monospace";
  ctx.fillText(`YOUR TASTE TWIN: ${tasteTwin}% OF VOTERS`, cx, 690);

  // Divider before footer
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(40, 730);
  ctx.lineTo(w - 40, 730);
  ctx.stroke();

  // Footer
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "400 11px 'Space Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("taste-engine-seven.vercel.app", cx, 760);

  // Decorative corner marks
  const cm = 10;
  ctx.strokeStyle = "rgba(255,59,31,0.3)";
  ctx.lineWidth = 2;
  // Top-left
  ctx.beginPath();
  ctx.moveTo(20, 20 + cm);
  ctx.lineTo(20, 20);
  ctx.lineTo(20 + cm, 20);
  ctx.stroke();
  // Top-right
  ctx.beginPath();
  ctx.moveTo(w - 20 - cm, 20);
  ctx.lineTo(w - 20, 20);
  ctx.lineTo(w - 20, 20 + cm);
  ctx.stroke();
  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(20, h - 20 - cm);
  ctx.lineTo(20, h - 20);
  ctx.lineTo(20 + cm, h - 20);
  ctx.stroke();
  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(w - 20 - cm, h - 20);
  ctx.lineTo(w - 20, h - 20);
  ctx.lineTo(w - 20, h - 20 - cm);
  ctx.stroke();
}

/**
 * Gate component shown when user has < MIN_VOTES.
 */
function VoteGate({ votes, onKeepVoting }) {
  const pct = Math.min(100, Math.round((votes / MIN_VOTES) * 100));
  return (
    <div
      style={{
        maxWidth: 440,
        margin: "60px auto",
        textAlign: "center",
        padding: "0 22px",
      }}
    >
      <div
        className="disp"
        style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}
      >
        Unlock your Taste DNA
      </div>
      <p style={{ color: T.soft, marginBottom: 28, fontSize: 15 }}>
        Cast {MIN_VOTES} votes to generate your unique taste profile card.
      </p>
      <div
        style={{
          background: T.line,
          borderRadius: 99,
          height: 10,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: T.pop,
            borderRadius: 99,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div
        className="mono"
        style={{
          fontSize: 12,
          color: T.soft,
          letterSpacing: "0.12em",
          marginBottom: 28,
        }}
      >
        {votes} / {MIN_VOTES} VOTES
      </div>
      <button
        onClick={onKeepVoting}
        style={{
          background: T.ink,
          color: T.paper,
          border: "none",
          padding: "12px 28px",
          borderRadius: 99,
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Keep voting
      </button>
    </div>
  );
}

export default function TasteDNA({ items, votes, contrarian, crossCat, onBack }) {
  const canvasRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState(null);
  const [tasteTwin, setTasteTwin] = useState(50);

  const catStats = getCategoryStats(items);
  const radarData = getRadarData(catStats);
  const contrarianRate = votes > 0 ? contrarian / votes : 0;
  const crossCatRate = votes > 0 ? crossCat / votes : 0;
  const archetype = getArchetype(catStats, contrarianRate, crossCatRate);
  const { topPick, rarestPick } = getTopAndRarest(items);

  // Fetch global stats for taste twin
  useEffect(() => {
    fetchGlobalCategoryAverages().then((global) => {
      if (global) {
        const pct = computeTasteTwinPercent(catStats, global);
        setTasteTwin(pct);
      }
    });
  }, [votes]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = CARD_W;
    canvas.height = CARD_H;

    drawCard(ctx, {
      radarData,
      archetype,
      votes,
      contrarianPct: Math.round(contrarianRate * 100),
      topPick: topPick?.name || null,
      rarestPick: rarestPick?.name || null,
      tasteTwin,
    });
  }, [radarData, archetype, votes, contrarianRate, topPick, rarestPick, tasteTwin]);

  // Draw card after fonts are ready
  useEffect(() => {
    if (votes < MIN_VOTES) return;
    document.fonts.ready.then(drawCanvas);
  }, [drawCanvas, votes]);

  if (votes < MIN_VOTES) {
    return <VoteGate votes={votes} onKeepVoting={onBack} />;
  }

  const handleCopyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopyStatus("copied");
    } catch {
      // Fallback: download instead
      handleDownload();
      setCopyStatus("downloaded");
    }
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "taste-dna.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const shareText = `I'm "${archetype}" on Taste Engine. What's your taste DNA?`;
  const shareUrl = "https://taste-engine-seven.vercel.app";

  const handleShareX = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      "_blank"
    );
  };

  const handleShareFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`,
      "_blank"
    );
  };

  const handleShareWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`,
      "_blank"
    );
  };

  const handleShareTelegram = () => {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
      "_blank"
    );
  };

  const handleShareReddit = () => {
    window.open(
      `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`,
      "_blank"
    );
  };

  const handleShareLinkedIn = () => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
      "_blank"
    );
  };

  const handleNativeShare = async () => {
    if (!navigator.share) return;
    const canvas = canvasRef.current;
    try {
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const file = new File([blob], "taste-dna.png", { type: "image/png" });
      await navigator.share({
        title: "My Taste DNA",
        text: shareText,
        url: shareUrl,
        files: [file],
      });
    } catch {
      // User cancelled or unsupported
    }
  };

  const shareBtnStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: 99,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  };

  const socialBtnStyle = (bg) => ({
    ...shareBtnStyle,
    background: bg,
    border: "none",
    color: "#fff",
  });

  return (
    <div
      style={{
        maxWidth: 660,
        margin: "0 auto",
        padding: "10px 22px 60px",
        textAlign: "center",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          maxWidth: CARD_W,
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      />

      {/* Utility buttons */}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          marginTop: 24,
          flexWrap: "wrap",
        }}
      >
        <button onClick={handleCopyImage} style={shareBtnStyle}>
          <Copy size={15} />
          {copyStatus === "copied" ? "Copied!" : "Copy Image"}
        </button>
        <button onClick={handleDownload} style={shareBtnStyle}>
          <Download size={15} /> Save PNG
        </button>
        {navigator.share && (
          <button onClick={handleNativeShare} style={shareBtnStyle}>
            <Share2 size={15} /> Share
          </button>
        )}
      </div>

      {/* Social share buttons */}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        <button onClick={handleShareX} style={socialBtnStyle("#000000")}>
          𝕏 Post
        </button>
        <button onClick={handleShareFacebook} style={socialBtnStyle("#1877F2")}>
          Facebook
        </button>
        <button onClick={handleShareWhatsApp} style={socialBtnStyle("#25D366")}>
          WhatsApp
        </button>
        <button onClick={handleShareTelegram} style={socialBtnStyle("#26A5E4")}>
          Telegram
        </button>
        <button onClick={handleShareReddit} style={socialBtnStyle("#FF4500")}>
          Reddit
        </button>
        <button onClick={handleShareLinkedIn} style={socialBtnStyle("#0A66C2")}>
          LinkedIn
        </button>
      </div>
    </div>
  );
}
