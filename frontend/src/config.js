// Contract addresses — Base Sepolia (84532). AgentRegistry + EIP-712 AgentVaultDepositor
// deploy 2026-06-11 (Roadmap v2 Phase 1 — deposit-only, signature-authorized).
export const AGENT_REGISTRY_ADDRESS = '0x735f3a63D5be965E6B7564a2befeca0E316d09Ad'
export const AGENT_VAULT_DEPOSITOR_ADDRESS = '0x79007794Eb31B6a8439C38B604827012DBc0D771'
// Single MockVault deployed alongside the new depositor — the demo's execution-safe target.
export const MOCK_VAULT_ADDRESS = '0xdef19fED6Da53D3757779d27b9A2640547c30b6F'
// Older standalone MockVault deployments — still valid ERC4626(asset=USDC) vaults, reusable
// as AgentRegistry scope targets (the registry doesn't care which depositor deployed them).
export const MOCK_VAULT_A_ADDRESS = '0x7791EA6F0438f30Cb8603864dc9E04E482684A52'
export const MOCK_VAULT_B_ADDRESS = '0x7efC008FAf255f579d617EC603b4d0cbEb6Aa612'
export const MOCK_VAULT_C_ADDRESS = '0x794204D8260d5cFD42c967056194d4CAc1397048'
export const MOCK_VAULT_D_ADDRESS = '0x2C15ec8b4B9fD7204767EFc79ca1B6dFd2EF874A'

// Network — Base Sepolia (84532). 1Shot Managed API supports this testnet
// (keyless permissionless relayer is mainnet-only — see relay.js).
// Constant name kept as SEPOLIA_* to avoid churn across ~10 importers.
export const SEPOLIA_CHAIN_ID = 84532
export const SEPOLIA_CHAIN_ID_HEX = '0x14a34'

// USDC — Base Sepolia (Circle official testnet, 6 decimals, FiatTokenProxy)
export const USDC_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

// APIs
export const ONE_SHOT_RELAYER_URL = 'https://relayer.1shotapi.com/relayers'
export const VENICE_BASE_URL = 'https://api.venice.ai/api/v1'
export const VENICE_MODEL = 'deepseek-v4-flash'
export const VENICE_TIMEOUT_MS = 60000

// DeepSeek — OpenAI-compatible, used as dev fallback when Venice x402 not funded
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
export const DEEPSEEK_MODEL = 'deepseek-v4-flash'
// Server-side AI proxy — key stays on the server (see api/ai.js). No secret in client.
export const AI_PROXY_URL = '/api/ai'

// AgentVaultDepositor ABI (EIP-712, deposit-only). Authorization is the worker key's
// signature recovered on-chain — NOT msg.sender — so any submitter (1Shot relayer) can
// broadcast. Scope is read from AgentRegistry; this contract holds none.
export const DEPOSITOR_ABI = [
  'function executeAgentDeposit(uint256 amount, uint256 minAmount, bytes32 execId, bytes sig) external returns (uint256 shares)',
  'function hashDeposit(uint256 amount, uint256 minAmount, bytes32 execId) external view returns (bytes32)',
  'function registry() external view returns (address)',
  'function executed(bytes32 execId) external view returns (bool)',
  'function reserves(address token) external view returns (uint256)',
  'event AgentDepositExecuted(address indexed agent, address indexed owner, address indexed vault, address token, uint256 assetsIn, uint256 sharesOut, bytes32 execId)'
]

// AgentRegistry ABI — single on-chain source of truth for per-agent deposit scope.
// authorizeSessionKey grants a scope; revokeAgent/revokeMany are user-signed kill switches.
export const REGISTRY_ABI = [
  'function authorizeSessionKey(address agent, address vault, address token, uint96 capPerPeriod, uint32 periodDuration, uint40 expiry) external',
  'function revokeAgent(address agent) external',
  'function revokeMany(address[] agents) external',
  'function isActive(address agent) external view returns (bool)',
  'function scopeOf(address agent) external view returns (tuple(address owner, address vault, address token, uint96 capPerPeriod, uint32 periodDuration, uint96 spentInPeriod, uint40 periodStart, uint40 expiry, bool revoked))',
  'function scopesOfOwner(address owner) external view returns (address[])',
  'event AgentAuthorized(address indexed owner, address indexed agent, address vault, address token, uint96 capPerPeriod, uint32 periodDuration, uint40 expiry)',
  'event AgentRevoked(address indexed owner, address indexed agent)'
]

// MockVault ABI — plain ERC-4626 (no custom rewards/withdraw helpers in the v2 contract).
// Positions reconcile via the 4626 standard (balanceOf + convertToAssets). User-signed
// withdraw uses the standard redeem(shares, receiver, owner). apyBps is our only extension.
export const VAULT_ABI = [
  'function apyBps() external view returns (uint256)',
  'function asset() external view returns (address)',
  'function balanceOf(address account) external view returns (uint256)',
  'function totalAssets() external view returns (uint256)',
  'function convertToAssets(uint256 shares) external view returns (uint256)',
  'function convertToShares(uint256 assets) external view returns (uint256)',
  'function maxWithdraw(address owner) external view returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets)',
  'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)'
]

// Vault catalog — enriched metadata so the AI advisor can reason, not just split.
// Each entry maps 1:1 to a deployed MockVault (A-D) in our execution-safe universe.
export const VAULT_CATALOG = [
  {
    name: 'Aave v3 USDC',
    protocol: 'aave-v3',
    address: MOCK_VAULT_A_ADDRESS,
    apy: 4.8,
    risk: 'low',
    yield_source: 'lending',
    drawdown: '-1.2',
    min_capital: 100,
    description: 'Overcollateralized pooled lending. Battle-tested, highest TVL in DeFi. Best for principal preservation.'
  },
  {
    name: 'Morpho Blue USDC',
    protocol: 'morpho-blue',
    address: MOCK_VAULT_B_ADDRESS,
    apy: 6.1,
    risk: 'medium',
    yield_source: 'curated',
    drawdown: '-2.8',
    min_capital: 500,
    description: 'Curator-managed isolated lending markets. Better yield than Aave, curator-dependent risk.'
  },
  {
    name: 'Pendle PT-USDC',
    protocol: 'pendle-v2',
    address: MOCK_VAULT_C_ADDRESS,
    apy: 9.4,
    risk: 'high',
    yield_source: 'structured',
    drawdown: '-6.5',
    min_capital: 1000,
    description: 'Fixed-rate yield via zero-coupon bond mechanics. Hold to maturity or face AMM exit loss.'
  },
  {
    name: 'Fluid USDC',
    protocol: 'fluid',
    address: MOCK_VAULT_D_ADDRESS,
    apy: 5.2,
    risk: 'high',
    yield_source: 'hybrid',
    drawdown: '-4.1',
    min_capital: 2000,
    description: 'Unified lending + DEX architecture. Highest capital efficiency, highest architectural risk.'
  }
]

// Back-compat alias — older imports referenced DEMO_VAULTS
export const DEMO_VAULTS = VAULT_CATALOG
