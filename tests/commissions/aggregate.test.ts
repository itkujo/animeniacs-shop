import { type ResolvedLine, aggregateLines } from '@/lib/commissions/sweep'
import { describe, expect, it } from 'vitest'

function line(over: Partial<ResolvedLine>): ResolvedLine {
  return {
    orderId: over.orderId ?? 'o1',
    // NB: use `in` so an explicit null (unattributed) isn't coerced back to ART_A.
    artistCategoryId: 'artistCategoryId' in over ? (over.artistCategoryId ?? null) : 'ART_A',
    yearMonth: over.yearMonth ?? '2026-08',
    itemType: over.itemType ?? 'acrylic',
    location: over.location ?? 'mobile',
    grossCents: over.grossCents ?? 0,
    discountCents: over.discountCents ?? 0,
    refundCents: over.refundCents ?? 0
  }
}

describe('aggregateLines', () => {
  it('sums money and nets per (artist, month, type, location) bucket', () => {
    const out = aggregateLines([
      line({ grossCents: 5000, discountCents: 1000 }),
      line({ grossCents: 3000, discountCents: 0 })
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      artistCategoryId: 'ART_A',
      grossCents: 8000,
      discountCents: 1000,
      netCents: 7000, // (5000-1000) + 3000
      orderCount: 1
    })
  })

  it('splits distinct buckets and counts distinct orders', () => {
    const out = aggregateLines([
      line({ orderId: 'o1', itemType: 'acrylic', grossCents: 1000 }),
      line({ orderId: 'o2', itemType: 'acrylic', grossCents: 2000 }),
      line({ orderId: 'o2', itemType: 'prints', grossCents: 500 }),
      line({ orderId: 'o3', artistCategoryId: null, grossCents: 900 }) // unattributed
    ])
    const acrylic = out.find((a) => a.itemType === 'acrylic' && a.artistCategoryId === 'ART_A')
    const prints = out.find((a) => a.itemType === 'prints')
    const unattributed = out.find((a) => a.artistCategoryId === null)
    expect(acrylic).toMatchObject({ netCents: 3000, orderCount: 2 })
    expect(prints).toMatchObject({ netCents: 500, orderCount: 1 })
    expect(unattributed).toMatchObject({ netCents: 900, orderCount: 1 })
  })

  it('nets never go negative (discount exceeds gross)', () => {
    const out = aggregateLines([line({ grossCents: 500, discountCents: 900 })])
    expect(out[0].netCents).toBe(0)
  })
})
