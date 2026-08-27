import { buildReport } from '@/lib/commissions/report'
import type { CommissionEarningView } from '@/lib/db/queries/commissions'
import { describe, expect, it } from 'vitest'

const rows: CommissionEarningView[] = [
  { artistId: 'a1', artistName: 'Bxnny.Arts', payable: true, yearMonth: '2026-07', commissionCents: 300 },
  { artistId: 'a1', artistName: 'Bxnny.Arts', payable: true, yearMonth: '2026-08', commissionCents: 800 },
  { artistId: 'a2', artistName: 'Merc Da Artist', payable: true, yearMonth: '2026-08', commissionCents: 500 },
  { artistId: 'a3', artistName: 'Animeniacs Studios', payable: false, yearMonth: '2026-08', commissionCents: 120 },
  { artistId: null, artistName: 'Unattributed', payable: false, yearMonth: '2026-08', commissionCents: 900 }
]

describe('buildReport', () => {
  it('builds a per-artist × per-month matrix with totals', () => {
    const r = buildReport(rows)
    expect(r.months).toEqual(['2026-07', '2026-08'])
    const bxnny = r.artists.find((a) => a.artistName === 'Bxnny.Arts')!
    expect(bxnny.byMonth).toEqual({ '2026-07': 300, '2026-08': 800 })
    expect(bxnny.totalCents).toBe(1100)
    expect(r.columnTotals).toEqual({ '2026-07': 300, '2026-08': 2320 })
    expect(r.grandTotalCents).toBe(2620)
  })

  it('excludes house + unattributed from the payable total', () => {
    const r = buildReport(rows)
    // 1100 (Bxnny) + 500 (Merc) — not Animeniacs Studios (house) or Unattributed.
    expect(r.payableTotalCents).toBe(1600)
  })

  it('sorts by total desc with Unattributed forced last', () => {
    const r = buildReport(rows)
    expect(r.artists.map((a) => a.artistName)).toEqual([
      'Bxnny.Arts', // 1100
      'Merc Da Artist', // 500
      'Animeniacs Studios', // 120
      'Unattributed' // 900 but forced last
    ])
  })
})
