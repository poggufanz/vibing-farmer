// Pure decision: does this move need the user's in-app ratify before executing?
// Single rule — ratify when an approval ceiling exists and the move meets it.
//   conservative ceiling 0   -> moveUsd >= 0  -> always
//   balanced     ceiling 100 -> moveUsd >= 100 -> high-value only
//   full         ceiling null -> never

/**
 * @param {{requireApprovalAboveUsd:number|null}|null} scope
 * @param {number} moveUsd
 * @returns {boolean}
 */
export function needsRatify(scope, moveUsd) {
  const ceiling = scope?.requireApprovalAboveUsd
  if (ceiling == null) return false
  if (!Number.isFinite(moveUsd)) return false
  return moveUsd >= ceiling
}
