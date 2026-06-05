import { describe, it, expect, vi, afterEach } from 'vitest'
import { completeJSON } from './venice.js'

afterEach(() => { vi.restoreAllMocks() })

describe('completeJSON', () => {
  it('returns the assistant message content string on success', async () => {
    const payload = JSON.stringify({ projectedNetYieldUSD: 42 })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: payload } }] }),
    })

    const out = await completeJSON({ systemPrompt: 'sys', userPrompt: 'user' })
    expect(out).toBe(payload)
    expect(global.fetch).toHaveBeenCalledOnce()
  })

  it('sends system + user messages in the request body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    })

    await completeJSON({ systemPrompt: 'SYS', userPrompt: 'USR' })
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'USR' },
    ])
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('throws when the provider returns a non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' })
    await expect(completeJSON({ systemPrompt: 's', userPrompt: 'u' })).rejects.toThrow('API 500')
  })
})
