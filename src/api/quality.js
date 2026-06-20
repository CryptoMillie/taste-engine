/**
 * Vote quality scoring function.
 * Returns a score from 0 to 1 based on timing, session depth, and pattern detection.
 * Threshold: quality >= 0.6 to count for campaign earnings.
 */

/**
 * @param {Object} params
 * @param {number} params.timeTakenMs - Time from pair shown to click
 * @param {number} params.sessionVoteCount - How many votes in this session
 * @param {number} params.leftPickCount - Times user picked left item
 * @param {number} params.rightPickCount - Times user picked right item
 * @returns {number} Quality score between 0 and 1
 */
export function scoreVoteQuality({ timeTakenMs, sessionVoteCount, leftPickCount, rightPickCount }) {
  // Time penalty
  let timeFactor;
  if (timeTakenMs < 1500) {
    timeFactor = 0.4; // Too fast — likely bot
  } else if (timeTakenMs >= 3000 && timeTakenMs <= 8000) {
    timeFactor = 1.0; // Ideal range
  } else if (timeTakenMs > 20000) {
    timeFactor = 0.8; // Too slow — distracted
  } else if (timeTakenMs < 3000) {
    // 1500-3000ms: linear ramp from 0.4 to 1.0
    timeFactor = 0.4 + (0.6 * (timeTakenMs - 1500)) / 1500;
  } else {
    // 8000-20000ms: linear ramp from 1.0 to 0.8
    timeFactor = 1.0 - (0.2 * (timeTakenMs - 8000)) / 12000;
  }

  // Session depth — new sessions are lower trust
  let depthFactor;
  if (sessionVoteCount <= 1) {
    depthFactor = 0.5;
  } else if (sessionVoteCount < 5) {
    depthFactor = 0.5 + (0.5 * (sessionVoteCount - 1)) / 4;
  } else {
    depthFactor = 1.0;
  }

  // Pattern detection — always picking same side suggests bot
  const totalPicks = leftPickCount + rightPickCount;
  let patternFactor = 1.0;
  if (totalPicks >= 5) {
    const maxSide = Math.max(leftPickCount, rightPickCount);
    const sameRate = maxSide / totalPicks;
    if (sameRate > 0.9) {
      patternFactor = 0.3;
    } else if (sameRate > 0.8) {
      patternFactor = 0.6;
    }
  }

  return Math.round(timeFactor * depthFactor * patternFactor * 1000) / 1000;
}

export const QUALITY_THRESHOLD = 0.6;
