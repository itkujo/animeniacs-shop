import 'server-only'
import {
  ensureArtistsForCategories,
  replaceAllCommissionEarnings
} from '@/lib/db/queries/commissions'
import type { NewCommissionEarning } from '@/lib/db/schema'
import { getArtistSubCategories } from '@/lib/square/categories'
import { commissionCents } from './calc'
import { sweepCommissionEarnings } from './sweep'

/** Rate for unattributed sales (no artist row to read a rate from). */
const DEFAULT_RATE = 0.2

export interface CommissionSyncResult {
  earningRows: number
  artistsSeen: number
  unattributedRows: number
  syncedAt: Date
}

/**
 * Recompute the whole commission cache from Square: sweep both locations (all
 * history) → ensure an artists row per artist category → apply each artist's
 * commission rate → wipe+rebuild `commission_earnings`. Idempotent; safe to
 * re-run any time. Uses the env-driven Square client (production in production).
 */
export async function runCommissionSync(): Promise<CommissionSyncResult> {
  const onlineLocationId = process.env.SQUARE_LOCATION_ID
  if (!onlineLocationId) {
    throw new Error('SQUARE_LOCATION_ID is not set — cannot run the commission sync.')
  }
  const mobileLocationId = process.env.SQUARE_MOBILE_LOCATION_ID

  const [aggregates, artistCats] = await Promise.all([
    sweepCommissionEarnings({ onlineLocationId, mobileLocationId }),
    getArtistSubCategories()
  ])

  const catMap = await ensureArtistsForCategories(
    artistCats.map((c) => ({ id: c.id, name: c.name }))
  )

  const computedAt = new Date()
  const rows: NewCommissionEarning[] = aggregates.map((a) => {
    const info = a.artistCategoryId ? catMap.get(a.artistCategoryId) : undefined
    const rate = info?.rate ?? DEFAULT_RATE
    return {
      artistId: info?.artistId ?? null,
      yearMonth: a.yearMonth,
      itemType: a.itemType,
      location: a.location,
      grossCents: a.grossCents,
      discountCents: a.discountCents,
      refundCents: a.refundCents,
      netCents: a.netCents,
      commissionCents: commissionCents(a.netCents, rate),
      orderCount: a.orderCount,
      computedAt
    }
  })

  await replaceAllCommissionEarnings(rows)

  return {
    earningRows: rows.length,
    artistsSeen: catMap.size,
    unattributedRows: rows.filter((r) => r.artistId === null).length,
    syncedAt: computedAt
  }
}
