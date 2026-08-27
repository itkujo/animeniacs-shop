import 'server-only'
import { db } from '@/lib/db/client'
import {
  type NewCommissionEarning,
  artists,
  commissionEarnings
} from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

/** House accounts: computed-but-not-owed. Seeded with payable=false. */
const HOUSE_ARTIST_NAMES = new Set(['Animeniacs Studios'])

/** name → slug matching the artists slug regex (^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$). */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  return s.length > 0 ? s : 'artist'
}

export interface ArtistCatInfo {
  artistId: string
  rate: number
  payable: boolean
  name: string
}

/**
 * Ensure every artist category has an `artists` row, then return a map
 * squareCategoryId → { artistId, rate, payable, name }. Missing categories are
 * INSERTED as `status:'inactive'` (so the commission sync never publishes a new
 * public artist page) with the default commission rate; existing rows are left
 * untouched so operator-set rates/payable/status win.
 */
export async function ensureArtistsForCategories(
  cats: Array<{ id: string; name: string }>
): Promise<Map<string, ArtistCatInfo>> {
  const existing = await db.select().from(artists)
  const byCat = new Map(existing.map((a) => [a.squareCategoryId, a]))
  const usedSlugs = new Set(existing.map((a) => a.slug))

  const toInsert = cats
    .filter((c) => !byCat.has(c.id))
    .map((c) => {
      let slug = slugify(c.name)
      let n = 1
      while (usedSlugs.has(slug)) slug = `${slugify(c.name)}-${++n}`
      usedSlugs.add(slug)
      return {
        slug,
        displayName: c.name,
        squareCategoryId: c.id,
        status: 'inactive' as const,
        payable: !HOUSE_ARTIST_NAMES.has(c.name)
      }
    })
  if (toInsert.length > 0) await db.insert(artists).values(toInsert)

  const all = toInsert.length > 0 ? await db.select().from(artists) : existing
  const map = new Map<string, ArtistCatInfo>()
  for (const a of all) {
    map.set(a.squareCategoryId, {
      artistId: a.id,
      rate: Number(a.commissionRate),
      payable: a.payable,
      name: a.displayName
    })
  }
  return map
}

/** Full rebuild of the materialized cache: wipe + bulk-insert in one transaction. */
export async function replaceAllCommissionEarnings(rows: NewCommissionEarning[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(commissionEarnings)
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(commissionEarnings).values(rows.slice(i, i + 500))
    }
  })
}

export interface CommissionEarningView {
  artistName: string
  payable: boolean
  yearMonth: string
  commissionCents: number
}

/** Flat earning rows joined to their artist (null artist → "Unattributed", non-payable). */
export async function getCommissionEarningRows(): Promise<CommissionEarningView[]> {
  const rows = await db
    .select({
      artistName: artists.displayName,
      payable: artists.payable,
      yearMonth: commissionEarnings.yearMonth,
      commissionCents: commissionEarnings.commissionCents
    })
    .from(commissionEarnings)
    .leftJoin(artists, eq(commissionEarnings.artistId, artists.id))
  return rows.map((r) => ({
    artistName: r.artistName ?? 'Unattributed',
    payable: r.artistName ? (r.payable ?? true) : false,
    yearMonth: r.yearMonth,
    commissionCents: r.commissionCents
  }))
}

/** Most recent sync timestamp, or null if never synced. */
export async function getLastCommissionSyncAt(): Promise<Date | null> {
  const [row] = await db
    .select({ computedAt: commissionEarnings.computedAt })
    .from(commissionEarnings)
    .orderBy(desc(commissionEarnings.computedAt))
    .limit(1)
  return row?.computedAt ?? null
}
