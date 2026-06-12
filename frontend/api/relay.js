// Server-side 1Shot Managed API proxy. Keeps ONESHOT_KEY / ONESHOT_SECRET /
// ONESHOT_BIZ_ID off the client bundle (mirrors api/ai.js).
//
// Why this exists: the keyless 1Shot Permissionless Relayer is mainnet-only
// (verified live via relayer_getCapabilities). Real, gas-abstracted 1Shot on
// Base Sepolia (84532) only exists through the Managed Dev Platform API, which
// authenticates with key+secret and a funded server wallet — secrets that can
// never ship in a Vite client bundle.
//
// Execution model (server-wallet-as-relayer):
//   The 1Shot server wallet broadcasts executeAgentDeposit(amount, minAmount, execId, sig).
//   Authorization is the EIP-712 WORKER-KEY signature inside `sig` — the depositor recovers
//   the signer and reads its scope from AgentRegistry — so msg.sender (the server wallet) is
//   irrelevant. The server wallet only sponsors gas; the cryptographic boundary is the sig +
//   the on-chain scope. No EIP-7702 / delegation redemption required.
//
// Two POST actions:
//   { action: 'wallet' }
//       → { address, chainId, walletId }      (auto-provisions the server wallet)
//   { action: 'deposit', amount, minAmount, execId, sig }
//       → { txHash, status }                  (executes + polls to a real hash)

import { applyCors, rateLimit } from './_guard.js'

const CHAIN_ID = 84532 // Base Sepolia

// 1Shot NewSolidityStructParam shape: `type` is the BASE enum
// (address/bool/bytes/int/string/uint/struct) — bit/byte width goes in `typeSize`,
// and `index` (ordinal position) is REQUIRED. bytes32 → {type:'bytes',typeSize:32};
// uint256 → {type:'uint',typeSize:256}; dynamic bytes → {type:'bytes'} (no typeSize).
const DEPOSIT_FN = 'executeAgentDeposit'
const DEPOSIT_INPUTS = [
  { name: 'amount', type: 'uint', typeSize: 256, index: 0 },
  { name: 'minAmount', type: 'uint', typeSize: 256, index: 1 },
  { name: 'execId', type: 'bytes', typeSize: 32, index: 2 },
  { name: 'sig', type: 'bytes', index: 3 },
]

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/
const BYTES_RE = /^0x[0-9a-fA-F]*$/
const UINT_RE = /^[0-9]+$/

// Canonical depositor address — server-controlled, NEVER from the client.
// A client-supplied target would let a caller make the funded server wallet
// register + execute against an arbitrary contract (and poison the method cache).
function depositorAddress() {
  return (
    process.env.AGENT_VAULT_DEPOSITOR_ADDRESS ||
    process.env.VITE_AGENT_VAULT_DEPOSITOR_ADDRESS ||
    ''
  )
}

// Warm-process caches — survive across calls in the same dev middleware process
// or warm serverless lambda. Re-resolved from the API on cold start.
let _client = null
let _serverWallet = null // { id, accountAddress }
const _contractMethodIds = new Map() // `${depositorAddress.toLowerCase()}:${fnName}` → methodId

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body // pre-parsed (serverless)
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function getClient() {
  if (_client) return _client
  const apiKey = process.env.ONESHOT_KEY
  const apiSecret = process.env.ONESHOT_SECRET
  if (!apiKey || !apiSecret || !process.env.ONESHOT_BIZ_ID) return null
  // Dynamic import so a missing package / missing creds never breaks vite.config load.
  return import('@uxly/1shot-client').then(({ OneShotClient }) => {
    _client = new OneShotClient({ apiKey, apiSecret })
    return _client
  })
}

/** Resolve (or auto-create) the Base Sepolia server wallet that sponsors gas. */
async function resolveServerWallet(client, bizId) {
  if (_serverWallet) return _serverWallet
  const list = await client.wallets.list(bizId, { chainId: CHAIN_ID })
  const existing = (list?.response || list?.data || list)?.[0]
  if (existing?.accountAddress) {
    _serverWallet = { id: existing.id, accountAddress: existing.accountAddress }
    return _serverWallet
  }
  const created = await client.wallets.create(bizId, {
    chainId: CHAIN_ID,
    name: 'Vibing Farmer Relayer (Base Sepolia)',
    description: 'Sponsors gas for AgentVaultDepositor.executeAgentDeposit',
  })
  _serverWallet = { id: created.id, accountAddress: created.accountAddress }
  return _serverWallet
}

const FN_META = {
  [DEPOSIT_FN]: { inputs: DEPOSIT_INPUTS, name: 'AgentVaultDepositor.executeAgentDeposit', desc: 'Relayed agent deposit authorized by an EIP-712 worker-key signature' },
}

/** Resolve (or auto-register) a contract method bound to the server wallet. */
async function resolveContractMethod(client, bizId, depositor, walletId, fnName = DEPOSIT_FN) {
  const cacheKey = `${depositor.toLowerCase()}:${fnName}`
  const cached = _contractMethodIds.get(cacheKey)
  if (cached) return cached
  const list = await client.contractMethods.list(bizId, { chainId: CHAIN_ID })
  const methods = list?.response || list?.data || list || []
  const match = methods.find(m =>
    m.functionName === fnName &&
    (m.contractAddress || '').toLowerCase() === depositor.toLowerCase()
  )
  if (match) {
    _contractMethodIds.set(cacheKey, match.id)
    return match.id
  }
  const meta = FN_META[fnName]
  const created = await client.contractMethods.create(bizId, {
    chainId: CHAIN_ID,
    contractAddress: depositor,
    walletId,
    name: meta.name,
    description: meta.desc,
    functionName: fnName,
    stateMutability: 'nonpayable',
    inputs: meta.inputs,
    outputs: [],
  })
  _contractMethodIds.set(cacheKey, created.id)
  return created.id
}

/** Poll a 1Shot transaction to a real on-chain hash (or terminal failure). */
async function pollForHash(client, txId, { tries = 16, intervalMs = 1500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const tx = await client.transactions.get(txId)
    if (tx?.transactionHash) return { txHash: tx.transactionHash, status: tx.status }
    if (tx?.status === 'Failed') throw new Error('1Shot transaction failed')
    await new Promise(r => setTimeout(r, intervalMs))
  }
  // Submitted but not yet mined within budget — return id so client can keep polling.
  return { txHash: null, status: 'Submitted', transactionId: txId }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'Method not allowed' }))
  }

  // Origin allowlist + per-IP rate limit. Origin is forgeable (curl) → not auth;
  // the cap blunts gas-drain DoS that would spam the funded 1Shot relayer wallet.
  if (!applyCors(req, res)) return
  if (!rateLimit(req, res, { max: 15, windowMs: 60_000, bucket: 'relay' })) return
  res.setHeader('Content-Type', 'application/json')

  const bizId = process.env.ONESHOT_BIZ_ID
  const client = await getClient()
  if (!client || !bizId) {
    res.statusCode = 503
    return res.end(JSON.stringify({ error: 'Relay proxy not configured', configured: false }))
  }

  try {
    const body = await readBody(req)
    const action = body.action

    if (action === 'wallet') {
      const wallet = await resolveServerWallet(client, bizId)
      return res.end(JSON.stringify({
        address: wallet.accountAddress,
        chainId: CHAIN_ID,
        walletId: wallet.id,
      }))
    }

    if (action === 'deposit') {
      const { amount, minAmount, execId, sig } = body
      // Target contract is server-controlled — NEVER from the client. The authorization is
      // the EIP-712 worker-key signature; the server wallet just sponsors gas.
      const depositor = depositorAddress()
      if (!ADDRESS_RE.test(depositor)) return bad(res, 'Depositor address not configured')
      if (!UINT_RE.test(String(amount ?? ''))) return bad(res, 'Invalid amount')
      if (!UINT_RE.test(String(minAmount ?? ''))) return bad(res, 'Invalid minAmount')
      if (!BYTES32_RE.test(execId || '')) return bad(res, 'Invalid execId')
      if (!BYTES_RE.test(sig || '') || (sig || '').length < 4) return bad(res, 'Invalid sig')

      const wallet = await resolveServerWallet(client, bizId)
      const methodId = await resolveContractMethod(client, bizId, depositor, wallet.id, DEPOSIT_FN)
      const tx = await client.contractMethods.execute(methodId, {
        amount: String(amount), minAmount: String(minAmount), execId, sig,
      })
      const result = await pollForHash(client, tx.id)
      return res.end(JSON.stringify({ ...result, relayer: wallet.accountAddress }))
    }

    return bad(res, 'Unknown action')
  } catch (err) {
    // Log full detail server-side (vite terminal / serverless logs) for debugging —
    // ZodError from a malformed contractMethod create surfaces here. Never echo to client.
    console.error('[api/relay] error:', err?.message || err, err?.issues || '')
    res.statusCode = 502
    return res.end(JSON.stringify({ error: 'Relay proxy failed' }))
  }
}

function bad(res, msg) {
  res.statusCode = 400
  return res.end(JSON.stringify({ error: msg }))
}
