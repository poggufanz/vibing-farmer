import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  _calculateVariance,
  _calculateVolatility,
  _calculateTurbulenceIndex,
} from './fetcher.js'

// ─── Pure math ────────────────────────────────────────────────────────────────

describe('_calculateVariance', () => {
  it('returns 0 for empty array', () => {
    expect(_calculateVariance([])).toBe(0)
  })

  it('returns 0 for single value', () => {
    expect(_calculateVariance([5])).toBe(0)
  })

  it('computes variance correctly', () => {
    // [2,4,4,4,5,5,7,9] — mean=5, variance=4
    expect(_calculateVariance([2, 4, 4, 4, 5, 5, 7, 9])).toBe(4)
  })
})

describe('_calculateVolatility', () => {
  it('returns 0 for identical APYs', () => {
    expect(_calculateVolatility([{ apy: 5 }, { apy: 5 }, { apy: 5 }])).toBe(0)
  })

  it('result is always in 0–1 range', () => {
    const pools = [{ apy: 100 }, { apy: 200 }, { apy: 300 }]
    const vol = _calculateVolatility(pools)
    expect(vol).toBeGreaterThanOrEqual(0)
    expect(vol).toBeLessThanOrEqual(1)
  })
})

describe('_calculateTurbulenceIndex', () => {
  it('result is always in 0–1 range', () => {
    const pools = [{ apy: 10, tvlDelta24h: 0.05 }, { apy: 12, tvlDelta24h: -0.02 }]
    const turb = _calculateTurbulenceIndex(pools, { protocolAlerts: [] })
    expect(turb).toBeGreaterThanOrEqual(0)
    expect(turb).toBeLessThanOrEqual(1)
  })

  it('increases with more protocol alerts', () => {
    const pools = [{ apy: 5, tvlDelta24h: 0 }]
    const low = _calculateTurbulenceIndex(pools, { protocolAlerts: [] })
    const high = _calculateTurbulenceIndex(pools, { protocolAlerts: ['a', 'b'] })
    expect(high).toBeGreaterThan(low)
  })

  it('handles missing tvlDelta24h without throwing', () => {
    expect(() =>
      _calculateTurbulenceIndex([{ apy: 5 }], { protocolAlerts: [] })
    ).not.toThrow()
  })
})

// ─── Individual API fetchers ──────────────────────────────────────────────────

import {
  fetchGasPrice,
  fetchEthPrice,
  fetchPositionsStub,
} from './fetcher.js'

beforeEach(() => {
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchGasPrice', () => {
  it('returns gas price in gwei as a number', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ result: { ProposeGasPrice: '25' } }),
    })
    const gwei = await fetchGasPrice()
    expect(gwei).toBe(25)
    expect(typeof gwei).toBe('number')
  })

  it('calls Etherscan gas oracle endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ result: { ProposeGasPrice: '20' } }),
    })
    await fetchGasPrice()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('gastracker&action=gasoracle')
    )
  })
})

describe('fetchEthPrice', () => {
  it('returns ETH price in USD as a number', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ethereum: { usd: 3500 } }),
    })
    const price = await fetchEthPrice()
    expect(price).toBe(3500)
  })

  it('calls CoinGecko simple price endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ethereum: { usd: 3000 } }),
    })
    await fetchEthPrice()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('coingecko.com')
    )
  })
})

describe('fetchPositionsStub', () => {
  it('returns empty positionsMap (stub — real version reads on-chain in Step 9)', async () => {
    const result = await fetchPositionsStub('0xabc')
    expect(result).toEqual({})
  })
})

// ─── fetchCurrentState orchestration ─────────────────────────────────────────

vi.mock('../defiLlama.js', () => ({
  fetchDeFiLlamaVaults: vi.fn(async () => [
    {
      id: 'pool-aave', protocol: 'aave-v3', name: 'Aave v3 USDC',
      apy: 8.0, apyBase: 7.0, apyReward: 1.0,
      tvlUsd: 100_000_000, tvlDelta24h: 0.01, ilRisk: 'low', audited: true,
    },
  ]),
}))

import { fetchCurrentState } from './fetcher.js'

describe('fetchCurrentState', () => {
  const config = {
    walletAddress: '0xabc123',
    whitelist: ['aave-v3'],
    watchedPools: [],
  }

  beforeEach(() => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ result: { ProposeGasPrice: '22' } }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ ethereum: { usd: 3200 } }),
      })
  })

  it('returns a State object with all required fields', async () => {
    const state = await fetchCurrentState(config)
    expect(state).toHaveProperty('positions')
    expect(state).toHaveProperty('pools')
    expect(state).toHaveProperty('walletBalanceUSD')
    expect(state).toHaveProperty('gasPrice')
    expect(state).toHaveProperty('ethPriceUSD')
    expect(state).toHaveProperty('marketVolatility')
    expect(state).toHaveProperty('turbulenceIndex')
    expect(state).toHaveProperty('timeSinceLastRebalance')
    expect(state).toHaveProperty('timestamp')
  })

  it('state.gasPrice reflects fetched value', async () => {
    const state = await fetchCurrentState(config)
    expect(state.gasPrice).toBe(22)
  })

  it('state.ethPriceUSD reflects fetched value', async () => {
    const state = await fetchCurrentState(config)
    expect(state.ethPriceUSD).toBe(3200)
  })

  it('state.pools contains DeFiLlama data', async () => {
    const state = await fetchCurrentState(config)
    expect(state.pools.length).toBeGreaterThan(0)
  })

  it('turbulenceIndex is in 0–1 range', async () => {
    const state = await fetchCurrentState(config)
    expect(state.turbulenceIndex).toBeGreaterThanOrEqual(0)
    expect(state.turbulenceIndex).toBeLessThanOrEqual(1)
  })

  it('timeSinceLastRebalance is Infinity on first run (stub)', async () => {
    const state = await fetchCurrentState(config)
    expect(state.timeSinceLastRebalance).toBe(Infinity)
  })

  it('calls fetch exactly twice (gas + ETH price — DeFiLlama is mocked)', async () => {
    await fetchCurrentState(config)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
