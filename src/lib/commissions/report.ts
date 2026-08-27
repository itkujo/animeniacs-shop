import type { CommissionEarningView } from '@/lib/db/queries/commissions'

/**
 * Pure shaping of flat earning rows into the per-artist × per-month matrix the
 * admin report renders. No I/O — unit-tested. Artists sort by all-time total
 * (desc); "Unattributed" is forced last. `payableTotalCents` excludes both
 * house (payable=false) and unattributed.
 */

export interface ArtistReportRow {
  artistName: string
  payable: boolean
  byMonth: Record<string, number> // yearMonth → commission cents
  totalCents: number
}

export interface CommissionReport {
  months: string[] // sorted asc, all months present
  artists: ArtistReportRow[]
  columnTotals: Record<string, number> // yearMonth → total across all artists
  grandTotalCents: number
  payableTotalCents: number
}

export function buildReport(rows: CommissionEarningView[]): CommissionReport {
  const months = new Set<string>()
  const byArtist = new Map<string, ArtistReportRow>()

  for (const r of rows) {
    months.add(r.yearMonth)
    let a = byArtist.get(r.artistName)
    if (!a) {
      a = { artistName: r.artistName, payable: r.payable, byMonth: {}, totalCents: 0 }
      byArtist.set(r.artistName, a)
    }
    a.byMonth[r.yearMonth] = (a.byMonth[r.yearMonth] ?? 0) + r.commissionCents
    a.totalCents += r.commissionCents
  }

  const artists = [...byArtist.values()].sort((x, y) => {
    // Unattributed always last, then by total desc.
    const xu = x.artistName === 'Unattributed'
    const yu = y.artistName === 'Unattributed'
    if (xu !== yu) return xu ? 1 : -1
    return y.totalCents - x.totalCents
  })

  const sortedMonths = [...months].sort()
  const columnTotals: Record<string, number> = {}
  let grandTotalCents = 0
  let payableTotalCents = 0
  for (const a of artists) {
    grandTotalCents += a.totalCents
    if (a.payable && a.artistName !== 'Unattributed') payableTotalCents += a.totalCents
    for (const m of sortedMonths) columnTotals[m] = (columnTotals[m] ?? 0) + (a.byMonth[m] ?? 0)
  }

  return { months: sortedMonths, artists, columnTotals, grandTotalCents, payableTotalCents }
}
