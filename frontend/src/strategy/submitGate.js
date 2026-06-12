// frontend/src/strategy/submitGate.js
// One responsibility: decide whether a single deposit may be submitted RIGHT NOW.
// Soft circuit breaker; the hard stop is AgentVaultDepositor.pause() on-chain.
// Three guards, cheapest first:
//   1. stale_gas    — snapshot older than maxGasAgeMs (or missing)
//   2. uneconomic   — gas cost >= expected benefit (the Hermes fast-fail idea)
//   3. rate_anomaly — more than maxPerMin submits for one owner inside a minute
// The decision log is a bounded ring buffer (maxDecisions) so a long-running
// worker cannot leak memory through it.
const ONE_MIN = 60_000;

export function createSubmitGate({
  now = () => Date.now(),
  maxGasAgeMs = 15_000,
  maxPerMin = 5,
  maxDecisions = 1000,
} = {}) {
  const hits = new Map(); // owner -> number[] timestamps
  const decisions = [];

  function record(decision) {
    decisions.push(decision);
    if (decisions.length > maxDecisions) decisions.shift(); // ring buffer
    return decision;
  }

  function check({ owner, gasSnapshotAt, estGasCostWei, expectedBenefitWei }) {
    const t = now();
    let ok = true, reason = 'ok';

    if (gasSnapshotAt == null || t - gasSnapshotAt > maxGasAgeMs) {
      ok = false; reason = 'stale_gas';
    } else if (
      estGasCostWei != null && expectedBenefitWei != null &&
      estGasCostWei >= expectedBenefitWei
    ) {
      ok = false; reason = 'uneconomic';
    } else {
      const arr = (hits.get(owner) || []).filter((ts) => t - ts < ONE_MIN);
      if (arr.length >= maxPerMin) { ok = false; reason = 'rate_anomaly'; }
      else { arr.push(t); hits.set(owner, arr); }
    }

    return record({ at: t, owner, ok, reason });
  }

  return { check, log: () => decisions };
}
