import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Trophy, ArrowLeft, Sparkles, RotateCcw, User, Link2 } from "lucide-react";
import { createStore, pickPair } from "./engine/store";
import { loadAllItems } from "./engine/items";
import { pickPairWithCampaigns } from "./engine/pairing";
import { scoreVoteQuality, QUALITY_THRESHOLD } from "./api/quality";
import { submitVote } from "./api/votes";
import { useSession } from "./hooks/useSession";
import { useCampaigns } from "./hooks/useCampaigns";
import { useAuth } from "./hooks/useAuth";
import { T } from "./theme";
import Arena from "./components/Arena";
import Rankings from "./components/Rankings";
import TasteMeter from "./components/TasteMeter";
import CampaignBanner from "./components/CampaignBanner";
import Profile from "./components/Profile";
import TasteDNA from "./components/TasteDNA";
import Challenge from "./components/Challenge";

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "right", lineHeight: 1.05 }}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: T.soft,
          letterSpacing: "0.16em",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div className="disp" style={{ fontWeight: 700, fontSize: 22, color }}>
        {value}
      </div>
    </div>
  );
}

const btnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  background: T.ink,
  border: "none",
  color: T.paper,
  padding: "10px 16px",
  borderRadius: 99,
  fontSize: 15,
  cursor: "pointer",
  fontWeight: 600,
};

const socialBtnStyle = (bg) => ({
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

function MatchupShare({ pair, onCopyLink }) {
  const challengeUrl = `${window.location.origin}${window.location.pathname}?challenge=${pair[0].id},${pair[1].id}`;
  const text = `${pair[0].name} vs ${pair[1].name} — which do you prefer?`;

  const shareX = () =>
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(challengeUrl)}`, "_blank");
  const shareFB = () =>
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(challengeUrl)}&quote=${encodeURIComponent(text)}`, "_blank");
  const shareWA = () =>
    window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + challengeUrl)}`, "_blank");
  const shareTG = () =>
    window.open(`https://t.me/share/url?url=${encodeURIComponent(challengeUrl)}&text=${encodeURIComponent(text)}`, "_blank");
  const shareReddit = () =>
    window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(challengeUrl)}&title=${encodeURIComponent(text)}`, "_blank");

  return (
    <div style={{ textAlign: "center", marginTop: 22 }}>
      <div
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.16em", color: T.soft, marginBottom: 10 }}
      >
        CHALLENGE A FRIEND
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

/**
 * Parse challenge IDs from URL query string.
 * Format: ?challenge=itemId1,itemId2
 */
function parseChallengeFromURL() {
  const params = new URLSearchParams(window.location.search);
  const challenge = params.get("challenge");
  if (!challenge) return null;
  const ids = challenge.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 2) return ids;
  return null;
}

export default function App() {
  const store = useRef(createStore());
  const [items, setItems] = useState(store.current.getItems());
  const [pair, setPair] = useState(() => pickPair(store.current.getItems()));
  const [view, setView] = useState("arena");
  const [votes, setVotes] = useState(store.current.getVotes());
  const [contrarian, setContrarian] = useState(store.current.getContrarian());
  const [crossCat, setCrossCat] = useState(store.current.getCrossCat());
  const [verdict, setVerdict] = useState(null);
  const [flash, setFlash] = useState(null);
  const [locking, setLocking] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [lastPair, setLastPair] = useState(null);
  const [challengeIds, setChallengeIds] = useState(() => parseChallengeFromURL());

  const { sessionId, markPairShown, recordPick } = useSession();
  const { campaigns } = useCampaigns();
  const { userId } = useAuth();

  // Load expanded items on mount
  useEffect(() => {
    let cancelled = false;
    loadAllItems().then((loaded) => {
      if (cancelled || !loaded.length) return;
      store.current.mergeNewItems(loaded);
      const fresh = store.current.getItems();
      setItems(fresh);
      if (!itemsLoaded) {
        setPair(pickPair(fresh));
        setItemsLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get campaign item IDs for the current pair
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const campaignItemIds = activeCampaign?.itemIds ?? [];

  const nextPair = useCallback((freshItems) => {
    if (campaigns.length > 0) {
      const { pair: newPair, campaignId } = pickPairWithCampaigns(freshItems, campaigns);
      setPair(newPair);
      setActiveCampaignId(campaignId);
    } else {
      setPair(pickPair(freshItems));
      setActiveCampaignId(null);
    }
    markPairShown();
  }, [campaigns, markPairShown]);

  const choose = (winner, loser, pickedIndex) => {
    if (locking) return;
    setLocking(true);
    const cross = winner.cat !== loser.cat;
    const { delta, upset } = store.current.vote(winner.id, loser.id);
    setVerdict({ winnerId: winner.id, delta });
    setVotes((v) => v + 1);
    if (upset) setContrarian((c) => c + 1);

    // Track cross-category votes
    if (cross) {
      store.current.incrementCrossCat();
      setCrossCat((c) => c + 1);
    }

    // Save last pair for challenge link
    setLastPair([winner, loser]);

    // Quality scoring
    const pickData = recordPick(pickedIndex ?? 0);
    const qualityScore = scoreVoteQuality(pickData);

    // Background vote sync
    submitVote({
      userId,
      winnerId: winner.id,
      loserId: loser.id,
      campaignId: activeCampaignId,
      qualityScore,
      timeTakenMs: pickData.timeTakenMs,
      sessionId,
    }).then(({ earned, amount }) => {
      if (earned) {
        setFlash(`+$${amount.toFixed(2)} earned!`);
      }
    });

    // Flash messages
    if (activeCampaignId && qualityScore >= QUALITY_THRESHOLD) {
      // Earning flash handled by submitVote callback above
    } else if (cross) {
      setFlash(`${winner.name} over ${loser.name}? Bold.`);
    } else if (upset && Math.random() < 0.5) {
      setFlash("Rare taste — the crowd leans the other way.");
    } else if ((votes + 1) % 10 === 0) {
      setFlash(`${votes + 1} verdicts in. You're shaping the ranking.`);
    }

    setTimeout(() => {
      const fresh = store.current.getItems();
      setItems(fresh);
      nextPair(fresh);
      setVerdict(null);
      setLocking(false);
    }, 520);
  };

  const handleReset = () => {
    store.current.reset();
    const fresh = store.current.getItems();
    setItems(fresh);
    nextPair(fresh);
    setVotes(0);
    setContrarian(0);
    setCrossCat(0);
    setLastPair(null);
    setVerdict(null);
    setFlash("Rankings reset. Fresh start.");
  };

  const copyChallenge = () => {
    if (!lastPair) return;
    const url = `${window.location.origin}${window.location.pathname}?challenge=${lastPair[0].id},${lastPair[1].id}`;
    navigator.clipboard.writeText(url).then(() => {
      setFlash("Challenge link copied!");
    }).catch(() => {
      setFlash("Couldn't copy — try again.");
    });
  };

  const handleEnterApp = () => {
    setChallengeIds(null);
    // Clean URL without reload
    window.history.replaceState({}, "", window.location.pathname);
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const ranked = useMemo(
    () => [...items].sort((a, b) => b.rating - a.rating),
    [items]
  );
  const cRate = votes ? contrarian / votes : 0;
  const tasteLabel =
    votes < 6
      ? "Calibrating"
      : cRate > 0.4
        ? "Contrarian"
        : cRate > 0.2
          ? "Eclectic"
          : "Mainstream";

  // Challenge mode — takes priority over all views
  if (challengeIds) {
    const challengeItemA = items.find((i) => i.id === challengeIds[0]);
    const challengeItemB = items.find((i) => i.id === challengeIds[1]);

    // If items aren't loaded yet and we're still loading, show spinner
    if (!itemsLoaded && !challengeItemA && !challengeItemB) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: T.paper,
            color: T.soft,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <div className="mono" style={{ fontSize: 13, letterSpacing: "0.14em" }}>
            LOADING CHALLENGE...
          </div>
        </div>
      );
    }

    return (
      <Challenge
        itemA={challengeItemA}
        itemB={challengeItemB}
        onEnterApp={handleEnterApp}
        onVote={(winner, loser) => {
          store.current.vote(winner.id, loser.id);
          setVotes((v) => v + 1);
          const fresh = store.current.getItems();
          setItems(fresh);
        }}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.paper,
        color: T.ink,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 17,
      }}
    >
      {/* Header */}
      <header
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          padding: "26px 22px 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="disp" style={{ fontWeight: 800, fontSize: 30 }}>
            TASTE
          </span>
          <span
            className="mono"
            style={{ fontSize: 12, color: T.soft, letterSpacing: "0.22em" }}
          >
            ENGINE
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Stat label="VERDICTS" value={votes} color={T.ink} />
          <Stat
            label="YOUR TASTE"
            value={tasteLabel}
            color={tasteLabel === "Contrarian" ? T.pop : T.ink}
          />
          {votes >= 20 && (
            <button
              onClick={() => setView(view === "tasteDNA" ? "arena" : "tasteDNA")}
              style={{
                ...btnStyle,
                background: view === "tasteDNA" ? T.pop : T.ink,
              }}
              title="Taste DNA"
            >
              <Sparkles size={16} />
            </button>
          )}
          <button onClick={() => setView(view === "arena" ? "rankings" : "arena")} style={btnStyle}>
            {view === "arena" || view === "tasteDNA" ? (
              <>
                <Trophy size={16} /> Rankings
              </>
            ) : (
              <>
                <ArrowLeft size={16} /> Back
              </>
            )}
          </button>
          <button
            onClick={() => setView(view === "profile" ? "arena" : "profile")}
            style={{ ...btnStyle, background: view === "profile" ? T.pop : T.ink }}
            title="Profile"
          >
            <User size={16} />
          </button>
          {votes > 0 && (
            <button
              onClick={handleReset}
              style={{ ...btnStyle, background: "transparent", color: T.soft, padding: "10px 8px" }}
              title="Reset rankings"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Views */}
      {view === "tasteDNA" ? (
        <TasteDNA
          items={items}
          votes={votes}
          contrarian={contrarian}
          crossCat={crossCat}
          onBack={() => setView("arena")}
        />
      ) : view === "arena" ? (
        <main
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "10px 22px 44px",
          }}
        >
          <h1
            className="disp"
            style={{
              textAlign: "center",
              fontSize: "clamp(34px, 6.5vw, 56px)",
              fontWeight: 800,
              margin: "26px 0 30px",
            }}
          >
            Which do you <span style={{ color: T.pop }}>prefer</span>?
          </h1>
          <CampaignBanner campaign={activeCampaign} />
          <Arena
            pair={pair}
            verdict={verdict}
            onChoose={choose}
            campaignItemIds={campaignItemIds}
          />
          <TasteMeter contrarianRate={cRate} />

          {/* Share this matchup */}
          {lastPair && <MatchupShare pair={lastPair} onCopyLink={copyChallenge} />}

          <p
            className="mono"
            style={{
              textAlign: "center",
              fontSize: 12,
              color: T.soft,
              marginTop: 34,
              letterSpacing: "0.1em",
            }}
          >
            REAL TRENDING DATA · YOUR TAPS BUILD THE RANKING
          </p>
        </main>
      ) : view === "profile" ? (
        <Profile userId={userId} votes={votes} />
      ) : (
        <Rankings ranked={ranked} />
      )}

      {/* Toast */}
      {flash && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 28,
            transform: "translateX(-50%)",
            background: T.ink,
            color: T.paper,
            padding: "13px 20px",
            borderRadius: 99,
            fontSize: 15,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 9,
            boxShadow: "0 12px 40px rgba(20,16,10,.35)",
            animation: "rise .25s ease both",
            maxWidth: "90vw",
            textAlign: "center",
          }}
        >
          <Sparkles size={16} color={T.pop} /> {flash}
        </div>
      )}
    </div>
  );
}
