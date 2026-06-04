// council.js — Step 6: AI Council (TradingAgents-style specialist debate).
// Three specialists (Risk Auditor, Gas Checker, Strategy Guard) each see a
// different slice of the playbook and the SAME decision context, then emit a
// compressed EXECUTE/HOLD verdict. They run in parallel; any failure degrades to
// a protective HOLD so one bad AI call never forces a trade.
//
// Dependency-injected like simulator.js: `aiComplete` and `logger` are passed in
// so the module is testable with zero network/AI. createCouncilStage binds the
// real impls at wiring time (Step 14).

/**
 * Render a playbook rule array into the text block a specialist sees.
 * Sorted by net helpfulness so the most-trusted rules lead.
 *
 * NOTE: Step 8 (memory/playbook.js) will own the canonical version of this
 * formatter; this local copy gets deleted and imported from there once Step 8 lands.
 *
 * @param {Array<{id:string,helpful:number,harmful:number,text:string}>} [rules]
 * @returns {string}
 */
export function formatPlaybookForCouncil(rules) {
  if (!rules || rules.length === 0) return '(no rules yet)'
  return [...rules]
    .sort((a, b) => (b.helpful - b.harmful) - (a.helpful - a.harmful))
    .map(r => `[${r.id}] helpful=${r.helpful} harmful=${r.harmful} :: ${r.text}`)
    .join('\n')
}

/**
 * Split the playbook into the three specialist buckets by rule category.
 * @param {Array<{category:string}>} [playbook]
 * @returns {{riskAuditor:Array, gasChecker:Array, strategyGuard:Array}}
 */
export function filterPlaybookByRole(playbook) {
  const rules = playbook ?? []
  return {
    riskAuditor:   rules.filter(r => r.category === 'risk'),
    gasChecker:    rules.filter(r => r.category === 'gas'),
    strategyGuard: rules.filter(r => r.category === 'strategy'),
  }
}
