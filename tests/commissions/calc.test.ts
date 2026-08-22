import {
  type LineMoney,
  commissionCents,
  commissionItemType,
  lineNetCents,
  yearMonthInZone
} from '@/lib/commissions/calc'
import { describe, expect, it } from 'vitest'

describe('commissionItemType', () => {
  it('classifies the two canonical media names', () => {
    expect(commissionItemType('Acrylic Wall Art')).toBe('acrylic')
    expect(commissionItemType('Vinyl Decal Prints')).toBe('prints')
  })
  it('handles per-artist generic listings rung up at shows', () => {
    expect(commissionItemType('MariosDal Prints')).toBe('prints')
    expect(commissionItemType('Bunny print')).toBe('prints')
    expect(commissionItemType('DalynTNT Acrylic')).toBe('acrylic')
  })
  it('falls back to other for unknown/empty', () => {
    expect(commissionItemType('Regular')).toBe('other')
    expect(commissionItemType(null)).toBe('other')
    expect(commissionItemType(undefined)).toBe('other')
  })
})

describe('lineNetCents', () => {
  it('subtracts discount and refund from gross', () => {
    expect(lineNetCents({ grossCents: 5000, discountCents: 1000 })).toBe(4000)
    expect(lineNetCents({ grossCents: 5000, discountCents: 1000, refundCents: 500 })).toBe(3500)
  })
  it('never goes negative', () => {
    expect(lineNetCents({ grossCents: 1000, discountCents: 800, refundCents: 500 })).toBe(0)
  })
})

describe('commissionCents', () => {
  it('applies the rate and rounds to the nearest cent', () => {
    expect(commissionCents(4000, 0.2)).toBe(800)
    expect(commissionCents(3333, 0.2)).toBe(667) // 666.6 → 667
    expect(commissionCents(0, 0.2)).toBe(0)
  })
  it('supports non-default per-artist rates', () => {
    expect(commissionCents(10000, 0.3)).toBe(3000)
  })
})

describe('yearMonthInZone', () => {
  it('buckets by America/Chicago calendar month', () => {
    // 2026-03-01T04:30:00Z is still Feb 28 ~22:30 in Chicago (UTC-6 in winter).
    expect(yearMonthInZone('2026-03-01T04:30:00Z')).toBe('2026-02')
    // Well inside March.
    expect(yearMonthInZone('2026-03-15T12:00:00Z')).toBe('2026-03')
  })
})
