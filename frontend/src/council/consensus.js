export const CONSENSUS_THRESHOLDS = {
  REQUIRED_MAJORITY: 2, // EXECUTE votes needed out of 3 specialists
  MIN_CONFIDENCE: 0.6,  // minimum average confidence to act
}

/**
 * Reduce specialist verdicts to a single execute/hold decision.
 * EXECUTE requires BOTH a 2/3 EXECUTE majority AND average confidence >= MIN_CONFIDENCE.
 * Anything else degrades to a protective HOLD. Pure and synchronous: loop.js:49 calls
 * it inline as the evaluateConsensus stage (no await, no deps).
 *
 * @param {Array<{decision:string,confidence?:number,keyReason?:string}>} [verdicts]
 * @param {{REQUIRED_MAJORITY:number,MIN_CONFIDENCE:number}} [thresholds]
 * @returns {{
 *   finalDecision:'EXECUTE'|'HOLD',
 *   executeVotes:number,
 *   holdVotes:number,
 *   avgConfidence:number,
 *   verdicts:Array,
 *   rejectionReason:string|null
 * }}
 */
export function evaluateConsensus(verdicts, thresholds = CONSENSUS_THRESHOLDS) {
  const list = verdicts ?? []
  const executeVotes = list.filter(v => v.decision === 'EXECUTE')
  const holdVotes = list.filter(v => v.decision === 'HOLD')
  const avgConfidence = list.length
    ? list.reduce((s, v) => s + (v.confidence ?? 0), 0) / list.length
    : 0

  const majorityExecute = executeVotes.length >= thresholds.REQUIRED_MAJORITY
  const confidentEnough = avgConfidence >= thresholds.MIN_CONFIDENCE

  let finalDecision
  let rejectionReason

  if (majorityExecute && confidentEnough) {
    finalDecision = 'EXECUTE'
    rejectionReason = null
  } else if (!majorityExecute) {
    finalDecision = 'HOLD'
    rejectionReason =
      `Majority voted HOLD (${holdVotes.length}/${list.length}): ` +
      holdVotes.map(v => v.keyReason).filter(Boolean).join('; ')
  } else {
    finalDecision = 'HOLD'
    rejectionReason =
      `Confidence too low: ${(avgConfidence * 100).toFixed(0)}% < ${thresholds.MIN_CONFIDENCE * 100}%`
  }

  return {
    finalDecision,
    executeVotes: executeVotes.length,
    holdVotes: holdVotes.length,
    avgConfidence,
    verdicts: list,
    rejectionReason,
  }
}
