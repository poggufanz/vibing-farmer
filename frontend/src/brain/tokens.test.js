// frontend/src/brain/tokens.test.js
import { describe, it, expect } from 'vitest'
import { T } from './tokens.js'

describe('brain tokens', () => {
  it('maps every design key to a CSS var (not raw hex)', () => {
    const keys = ['bgBase','bgCanvas','bgCard','bgElev','bgElev2','border','borderStrong','text','textMuted','textFaint','accent','accentFg','info','warn','danger','ok']
    for (const k of keys) {
      expect(T[k], k).toMatch(/^var\(--[a-z0-9-]+\)$/)
    }
  })

  it('maps accent to the palette-aware token', () => {
    expect(T.accent).toBe('var(--accent)')
    expect(T.bgElev2).toBe('var(--bg-elev-2)')
  })
})
