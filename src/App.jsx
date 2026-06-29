import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Trophy, ArrowLeft, Sparkles, RotateCcw, User, TrendingUp, Zap, Cpu } from "lucide-react";
import { createStore, pickPair, getStreak, updateStreak } from "./engine/store";
import { loadAllItems } from "./engine/items";
import { pickPairWithCampaigns } from "./engine/pairing";
import { pickPairPersonalized, prefetchAIPair } from "./engine/personalize";
import { scoreVoteQuality, QUALITY_THRESHOLD } from "./api/quality";
import { submitVote } from "./api/votes";
import { useSession } from "./hooks/useSession";
import { useCampaigns } from "./hooks/useCampaigns";
import { useAuth } from "./hooks/useAuth";
import { useCoins } from "./hooks/useCoins";
import { T } from "./theme";
import Arena from "./components/Arena";
import Rankings from "./components/Rankings";
import TasteMeter from "./components/TasteMeter";
import CampaignBanner from "./components/CampaignBanner";
import Profile from "./components/Profile";
import TasteDNA from "./components/TasteDNA";
import Challenge from "./components/Challenge";
import MatchupShare from "./components/MatchupShare";
import TrendingPolls from "./components/TrendingPolls";
import PollArena from "./components/PollArena";
import SpeedRound from "./components/SpeedRound";
import StakePanel from "./components/StakePanel";
import ComputeDashboard from "./components/ComputeDashboard";
import { useCompute } from "./hooks/useCompute";
import { POLLS } from "./data/polls";

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
  minHeight: 44,
  minWidth: 44,
  justifyContent: "center",
};

const VOTED_KEY = "taste-polls-voted";

function parsePollFromURL() {
  const params = new URLSearchParams(window.location.search);
  const pollId = params.get("poll");
  if (!pollId) return null;
  return POLLS.find((p) => p.id === pollId) || null;
}

function markPollVoted(pollId, pickedId) {
  try {
    const voted = JSON.parse(localStorage.getItem(VOTED_KEY) || "{}");
    if (!voted[pollId]) {
      voted[pollId] = { pickedId, votedAt: Date.now() };
      localStorage.setItem(VOTED_KEY, JSON.stringify(voted));
    }
  } catch { /* ignore */ }
}

function isPollVoted(pollId) {
  try {
    const voted = JSON.parse(localStorage.getItem(VOTED_KEY) || "{}");
    return !!voted[pollId];
  } catch {
    return false;
  }
}

/**
 * Parse challenge IDs and optional challenger pick from URL query string.
 * Format: ?challenge=itemId1,itemId2&pick=itemId1
 */
function parseChallengeFromURL() {
  const params = new URLSearchParams(window.location.search);
  const challenge = params.get("challenge");
  if (!challenge) return null;
  const ids = challenge.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 2) {
    const pick = params.get("pick") || null;
    return { ids, challengerPick: pick };
  }
  return null;
}

export default function App() {
  const store = useRef(createStore());
  const [items, setItems] = useState(store.current.getItems());
  const [pair, setPair] = useState(() => pickPair(store.current.getItems()));
  const [view, setView] = useState(() => parsePollFromURL() ? "pollArena" : "arena");
  const [votes, setVotes] = useState(store.current.getVotes());
  const [contrarian, setContrarian] = useState(store.current.getContrarian());
  const [crossCat, setCrossCat] = useState(store.current.getCrossCat());
  const [verdict, setVerdict] = useState(null);
  const [flash, setFlash] = useState(null);
  const [locking, setLocking] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [lastPair, setLastPair] = useState(null);
  const [streak, setStreak] = useState(() => getStreak());
  const [challengeData, setChallengeData] = useState(() => parseChallengeFromURL());
  const [activePoll, setActivePoll] = useState(() => {
    const poll = parsePollFromURL();
    if (poll) {
      // Merge poll items into store on load
      store.current.mergeNewItems([poll.itemA, poll.itemB]);
    }
    return poll;
  });

  const { sessionId, markPairShown, recordPick } = useSession();
  const { campaigns } = useCampaigns();
  const { userId, authProvider, userMeta, signInWithGoogle, signInWithTwitter, signOut } = useAuth();
  const { balance: coinBalance, lifetimeEarned: coinLifetime, refresh: refreshCoins, addOptimistic: addCoinsOptimistic } = useCoins(userId);
  const compute = useCompute(userId);
  const [hasStaked, setHasStaked] = useState(false);

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
        // Prefetch first AI-suggested pair
        prefetchAIPair(fresh, store.current.getPrefs(), store.current.getVotes(), store.current.getContrarian(), store.current.getCrossCat());
      }
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get campaign item IDs for the current pair
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const campaignItemIds = activeCampaign?.itemIds ?? [];

  const nextPair = useCallback((freshItems) => {
    const prefs = store.current.getPrefs();
    if (campaigns.length > 0) {
      const { pair: newPair, campaignId } = pickPairWithCampaigns(freshItems, campaigns, prefs);
      setPair(newPair);
      setActiveCampaignId(campaignId);
    } else {
      setPair(pickPairPersonalized(freshItems, prefs));
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

    // Update daily streak
    const streakResult = updateStreak();
    if (streakResult.isNew) {
      setStreak(streakResult);
      const s = streakResult.current;
      if (s === 3) setFlash("3-day streak! Keep it going.");
      else if (s === 7) setFlash("7-day streak! You're on fire.");
      else if (s === 14) setFlash("14-day streak! Unstoppable.");
      else if (s === 30) setFlash("30-day streak! Legend status.");
      else if (s === 100) setFlash("100-day streak! Absolute machine.");
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
      streakDays: streak.current || 0,
    }).then(({ earned, amount, coinsEarned }) => {
      if (earned) {
        setFlash(`+$${amount.toFixed(2)} earned!`);
      } else if (coinsEarned > 0) {
        addCoinsOptimistic(coinsEarned);
        setFlash(`+${coinsEarned} coins!`);
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
      setHasStaked(false);
      // Prefetch next AI pair in background
      prefetchAIPair(fresh, store.current.getPrefs(), votes + 1, contrarian, crossCat);
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
    const url = `${window.location.origin}${window.location.pathname}?challenge=${lastPair[0].id},${lastPair[1].id}&pick=${lastPair[0].id}`;
    navigator.clipboard.writeText(url).then(() => {
      setFlash("Challenge link copied!");
    }).catch(() => {
      setFlash("Couldn't copy — try again.");
    });
  };

  const handleEnterApp = () => {
    setChallengeData(null);
    // Clean URL without reload
    window.history.replaceState({}, "", window.location.pathname);
  };

  const handleSelectPoll = (poll) => {
    // Merge poll items into the store so they get Elo records
    store.current.mergeNewItems([poll.itemA, poll.itemB]);
    setItems(store.current.getItems());
    setActivePoll(poll);
    setView("pollArena");
    window.history.pushState({}, "", `?poll=${poll.id}`);
  };

  const handlePollVote = (poll, winner, loser) => {
    // One vote per device per poll
    if (isPollVoted(poll.id)) return;

    store.current.vote(winner.id, loser.id);
    setVotes((v) => v + 1);
    setItems(store.current.getItems());
    markPollVoted(poll.id, winner.id);

    // Background vote sync
    submitVote({
      userId,
      winnerId: winner.id,
      loserId: loser.id,
      sessionId,
    });
  };

  const handlePollBack = () => {
    setActivePoll(null);
    setView("polls");
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
  if (challengeData) {
    const challengeItemA = items.find((i) => i.id === challengeData.ids[0]);
    const challengeItemB = items.find((i) => i.id === challengeData.ids[1]);

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
        challengerPick={challengeData.challengerPick}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Stat label="VERDICTS" value={votes} color={T.ink} />
          {coinBalance > 0 && (
            <Stat label="COINS" value={coinBalance} color="#d97706" />
          )}
          {streak.current > 0 && (
            <Stat label="STREAK" value={`\u{1F525} ${streak.current}`} color={streak.current >= 7 ? T.pop : T.ink} />
          )}
          <Stat
            label="YOUR TASTE"
            value={tasteLabel}
            color={tasteLabel === "Contrarian" ? T.pop : T.ink}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
            <button
              onClick={() => setView(view === "speedRound" ? "arena" : "speedRound")}
              style={{
                ...btnStyle,
                background: view === "speedRound" ? T.pop : T.ink,
              }}
              title="Speed Round"
            >
              <Zap size={16} /> <span className="header-label">Speed</span>
            </button>
            <button
              onClick={() => {
                if (view === "polls" || view === "pollArena") {
                  setActivePoll(null);
                  setView("arena");
                  window.history.replaceState({}, "", window.location.pathname);
                } else {
                  setView("polls");
                }
              }}
              style={{
                ...btnStyle,
                background: view === "polls" || view === "pollArena" ? T.pop : T.ink,
              }}
              title="Trending Polls"
            >
              <TrendingUp size={16} /> <span className="header-label">Trending</span>
            </button>
            <button onClick={() => setView(view === "arena" ? "rankings" : "arena")} style={btnStyle}>
              {view === "arena" || view === "tasteDNA" ? (
                <>
                  <Trophy size={16} /> <span className="header-label">Rankings</span>
                </>
              ) : (
                <>
                  <ArrowLeft size={16} /> <span className="header-label">Back</span>
                </>
              )}
            </button>
            <button
              onClick={() => setView(view === "compute" ? "arena" : "compute")}
              style={{
                ...btnStyle,
                background: view === "compute" ? "#16a34a" : T.ink,
              }}
              title="Earn with GPU"
            >
              <Cpu size={16} /> <span className="header-label">Earn</span>
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
          <StakePanel
            pair={pair}
            coinBalance={coinBalance}
            hasStaked={hasStaked}
            userId={userId}
            onStake={(amount) => {
              addCoinsOptimistic(-amount);
              setHasStaked(true);
              setFlash(`Staked ${amount} coins!`);
            }}
          />
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
      ) : view === "polls" ? (
        <TrendingPolls polls={POLLS} onSelectPoll={handleSelectPoll} />
      ) : view === "pollArena" && activePoll ? (
        <PollArena poll={activePoll} onVote={handlePollVote} onBack={handlePollBack} />
      ) : view === "speedRound" ? (
        <SpeedRound
          items={items}
          store={store}
          userId={userId}
          sessionId={sessionId}
          streakDays={streak.current || 0}
          onCoinsEarned={(amount) => addCoinsOptimistic(amount)}
          onComplete={(results) => {
            setVotes(store.current.getVotes());
            setItems(store.current.getItems());
            refreshCoins();
            setView("arena");
          }}
          onBack={() => setView("arena")}
        />
      ) : view === "compute" ? (
        <ComputeDashboard
          gpuAvailable={compute.gpuAvailable}
          gpuInfo={compute.gpuInfo}
          gpuClass={compute.gpuClass}
          enabled={compute.enabled}
          toggle={compute.toggle}
          starting={compute.starting}
          error={compute.error}
          status={compute.status}
          currentJob={compute.currentJob}
          jobsThisSession={compute.jobsThisSession}
          coinsThisSession={compute.coinsThisSession}
          usdcThisSession={compute.usdcThisSession}
          workerStats={compute.workerStats}
          membership={compute.membership}
          networkStats={compute.networkStats}
          sessionElapsed={compute.sessionElapsed}
          earningsRate={compute.earningsRate}
          modelStatus={compute.modelStatus}
          modelProgress={compute.modelProgress}
          trustScore={compute.trustScore}
          verificationHistory={compute.verificationHistory}
        />
      ) : view === "profile" ? (
        <Profile
          userId={userId}
          votes={votes}
          coinBalance={coinBalance}
          coinLifetime={coinLifetime}
          authProvider={authProvider}
          userMeta={userMeta}
          onSignInGoogle={signInWithGoogle}
          onSignInTwitter={signInWithTwitter}
          onSignOut={signOut}
          computeStats={compute.workerStats}
        />
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
