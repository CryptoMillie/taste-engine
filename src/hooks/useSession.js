import { useState, useRef, useCallback } from "react";

function generateSessionId() {
  return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/**
 * Track session ID, vote timestamps, and left/right pick counts.
 */
export function useSession() {
  const [sessionId] = useState(() => generateSessionId());
  const sessionVoteCount = useRef(0);
  const leftPickCount = useRef(0);
  const rightPickCount = useRef(0);
  const pairShownAt = useRef(Date.now());

  const markPairShown = useCallback(() => {
    pairShownAt.current = Date.now();
  }, []);

  const recordPick = useCallback((pickedIndex) => {
    sessionVoteCount.current += 1;
    if (pickedIndex === 0) {
      leftPickCount.current += 1;
    } else {
      rightPickCount.current += 1;
    }

    const timeTakenMs = Date.now() - pairShownAt.current;

    return {
      timeTakenMs,
      sessionId,
      sessionVoteCount: sessionVoteCount.current,
      leftPickCount: leftPickCount.current,
      rightPickCount: rightPickCount.current,
    };
  }, [sessionId]);

  return { sessionId, markPairShown, recordPick };
}
