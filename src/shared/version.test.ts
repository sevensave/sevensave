import { describe, expect, it } from 'vitest'
import { newer } from './version'

describe('newer', () => {
  it('сравнивает по частям, а не строкой', () => {
    expect(newer('1.10.0', '1.9.9')).toBe(true)
    expect(newer('1.9.9', '1.10.0')).toBe(false)
    expect(newer('2.0.0', '1.99.99')).toBe(true)
  })
  it('равные версии не новее', () => {
    expect(newer('1.8.0', '1.8.0')).toBe(false)
    expect(newer('v1.8.0', '1.8.0')).toBe(false)
  })
  it('патч и «v» в начале', () => {
    expect(newer('v1.8.1', '1.8.0')).toBe(true)
    expect(newer('0.1.1', 'v0.1.0')).toBe(true)
  })
  it('недостающие части считаются нулём', () => {
    expect(newer('1.8', '1.8.0')).toBe(false)
    expect(newer('1.8.0.1', '1.8')).toBe(false)
    expect(newer('1.9', '1.8.5')).toBe(true)
  })
  it('мусор не считается обновлением', () => {
    expect(newer('abc', '1.0.0')).toBe(false)
  })
})
