// Contract addresses — Ethereum Sepolia deploy
export const AGENT_VAULT_DEPOSITOR_ADDRESS = '0xc17883C82Cd3c4FfF24B6C07eAd07840e4fa2404'
export const MOCK_VAULT_A_ADDRESS = '0x72bC6b01A60e22ab8b9D62E8237B37633C36aBa5'
export const MOCK_VAULT_B_ADDRESS = '0x2BF6aa67D7a372ad0f4F45Bf2223156DF12eF9DF'

// Network — Ethereum Sepolia (demo); for mainnet use Base (8453) or Base Sepolia (84532)
export const SEPOLIA_CHAIN_ID = 11155111
export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7'

// USDC — Ethereum Sepolia (Circle official testnet)
export const USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

// APIs
export const ONE_SHOT_RELAYER_URL = 'https://relayer.1shotapi.com/relayers'
export const VENICE_BASE_URL = 'https://api.venice.ai/api/v1'
export const VENICE_MODEL = 'claude-opus-4-8'
export const VENICE_TIMEOUT_MS = 60000

// DeepSeek — OpenAI-compatible, used as dev fallback when Venice x402 not funded
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
export const DEEPSEEK_MODEL = 'deepseek-v4-pro'
// Server-side AI proxy — key stays on the server (see api/ai.js). No secret in client.
export const AI_PROXY_URL = '/api/ai'

// AgentVaultDepositor ABI — only what frontend needs
export const DEPOSITOR_ABI = [
  'function grantAgentPermission(bytes32 agentId, address vault, uint256 maxAmount, uint256 expiresAt) external',
  'function revokeAgentPermission(bytes32 agentId) external',
  'function executeAgentDeposit(bytes32 agentId, address user, address vault, uint256 amount) external',
  'function agentPermissions(address user, bytes32 agentId) external view returns (address vault, uint256 maxAmount, uint256 usedAmount, uint256 expiresAt, bool active)',
  'event AgentStarted(bytes32 indexed agentId, address indexed user, address vault)',
  'event SwapExecuted(bytes32 indexed agentId, address indexed user, uint256 amountIn, uint256 amountOut)',
  'event ApproveExecuted(bytes32 indexed agentId, address indexed user, address vault, uint256 amount)',
  'event DepositExecuted(bytes32 indexed agentId, address indexed user, address vault, uint256 amount, uint256 sharesReceived)',
  'event AgentCompleted(bytes32 indexed agentId, address indexed user, address vault, uint256 sharesReceived)',
  'event AgentFailed(bytes32 indexed agentId, address indexed user, string reason)'
]

// Vault catalog — enriched metadata so the AI advisor can reason, not just split.
// All entries map to the two really-deployed MockVaults (execution-safe universe).
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
    address: MOCK_VAULT_B_ADDRESS,
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
    address: MOCK_VAULT_A_ADDRESS,
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
