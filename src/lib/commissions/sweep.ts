import 'server-only'
import { getSquareClient } from '@/lib/square/client'
import { type CommissionItemType, commissionItemType, lineNetCents, yearMonthInZone } from './calc'

/**
 * Commission sweep — reads Square (env-driven `getSquareClient()`; production in
 * production) across BOTH the online and Mobile/show locations, all history, and
 * folds every COMPLETED order line into per-(artist-category, month, item-type,
 * location) NET aggregates. It intentionally stops at NET dollars + artist
 * CATEGORY id — mapping category→our `artists` row and applying each artist's
 * commission rate happens in the sync/persist step, so this stays pure of DB and
 * rate policy. The productionized form of the validated report script.
 *
 * v1 refund handling: `refundCents` is 0 (pre-refund). Proportional refund
 * clawback is a tracked follow-up — it needs the payment↔order↔line cross-ref.
 */

export type SalesLocation = 'online' | 'mobile'

export interface ResolvedLine {
  orderId: string
  artistCategoryId: string | null // null = unattributed (no artist category / custom line)
  yearMonth: string
  itemType: CommissionItemType
  location: SalesLocation
  grossCents: number
  discountCents: number
  refundCents: number
}

export interface EarningAggregate {
  artistCategoryId: string | null
  yearMonth: string
  itemType: CommissionItemType
  location: SalesLocation
  grossCents: number
  discountCents: number
  refundCents: number
  netCents: number
  orderCount: number
}

/**
 * PURE: fold resolved lines into aggregates keyed by
 * (artistCategoryId, yearMonth, itemType, location). `orderCount` is the number
 * of DISTINCT orders that contributed to each bucket. No I/O — unit-tested.
 */
export function aggregateLines(lines: ResolvedLine[]): EarningAggregate[] {
  const map = new Map<string, EarningAggregate & { orders: Set<string> }>()
  for (const l of lines) {
    const key = `${l.artistCategoryId ?? '∅'}|${l.yearMonth}|${l.itemType}|${l.location}`
    let a = map.get(key)
    if (!a) {
      a = {
        artistCategoryId: l.artistCategoryId,
        yearMonth: l.yearMonth,
        itemType: l.itemType,
        location: l.location,
        grossCents: 0,
        discountCents: 0,
        refundCents: 0,
        netCents: 0,
        orderCount: 0,
        orders: new Set<string>()
      }
      map.set(key, a)
    }
    a.grossCents += l.grossCents
    a.discountCents += l.discountCents
    a.refundCents += l.refundCents
    a.netCents += lineNetCents(l)
    a.orders.add(l.orderId)
  }
  return [...map.values()].map(({ orders, ...rest }) => ({ ...rest, orderCount: orders.size }))
}

function toCents(amount: unknown): number {
  if (typeof amount === 'bigint') return Number(amount)
  if (typeof amount === 'number') return amount
  return 0
}

/**
 * Build variationId → artistCategoryId from the current catalog. The Artist
 * parent is discovered by name (mirrors categories.ts). A variation whose item
 * has no artist category (or that isn't in the catalog) resolves to null →
 * unattributed. Cheap churn tolerance without a per-order batchGet.
 */
async function buildVariationToArtist(
  client: ReturnType<typeof getSquareClient>
): Promise<Map<string, string>> {
  // Artist category ids (children of the "Artist" parent).
  const artistCatIds = new Set<string>()
  {
    // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
    const cats: any[] = []
    let cursor: string | undefined
    do {
      const resp = await client.catalog.search({
        objectTypes: ['CATEGORY'],
        ...(cursor ? { cursor } : {})
      })
      // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
      cats.push(...(((resp as any).objects as any[]) ?? []))
      cursor = (resp as { cursor?: string }).cursor
    } while (cursor)
    const parentId = cats.find(
      (c) => c.categoryData?.name === 'Artist' && !c.categoryData?.parentCategory?.id
    )?.id
    for (const c of cats) {
      if (c.categoryData?.parentCategory?.id === parentId) artistCatIds.add(c.id)
    }
  }

  const map = new Map<string, string>()
  let cursor: string | undefined
  do {
    const resp = await client.catalog.searchItems({ limit: 100, ...(cursor ? { cursor } : {}) })
    // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
    const items: any[] = ((resp as any).items as any[]) ?? []
    for (const it of items) {
      const cats: Array<{ id?: string }> = it.itemData?.categories ?? []
      const artistCat = cats.map((c) => c.id).find((id): id is string => !!id && artistCatIds.has(id))
      if (!artistCat) continue
      for (const v of it.itemData?.variations ?? []) {
        if (v.id) map.set(v.id, artistCat)
      }
    }
    cursor = (resp as { cursor?: string }).cursor
  } while (cursor)
  return map
}

export interface SweepOptions {
  onlineLocationId: string
  mobileLocationId?: string
  /** ISO start; defaults to well before any Square sale. */
  startAt?: string
  timeZone?: string
}

/**
 * Full sweep: returns NET aggregates for every COMPLETED order line across the
 * configured locations, from `startAt` to now. Attribution is by artist CATEGORY
 * (mapping to our artists rows + rate happens downstream).
 */
export async function sweepCommissionEarnings(opts: SweepOptions): Promise<EarningAggregate[]> {
  const client = getSquareClient()
  const locByLocationId = new Map<string, SalesLocation>([[opts.onlineLocationId, 'online']])
  if (opts.mobileLocationId) locByLocationId.set(opts.mobileLocationId, 'mobile')
  const tz = opts.timeZone ?? 'America/Chicago'

  const varToArtist = await buildVariationToArtist(client)

  const lines: ResolvedLine[] = []
  let cursor: string | undefined
  do {
    const resp = await client.orders.search({
      locationIds: [...locByLocationId.keys()],
      query: {
        filter: {
          stateFilter: { states: ['COMPLETED'] },
          dateTimeFilter: { closedAt: { startAt: opts.startAt ?? '2020-01-01T00:00:00Z' } }
        },
        sort: { sortField: 'CLOSED_AT', sortOrder: 'ASC' }
      },
      limit: 500,
      ...(cursor ? { cursor } : {})
    })
    // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
    const orders: any[] = ((resp as any).orders as any[]) ?? []
    for (const o of orders) {
      const location = locByLocationId.get(o.locationId)
      if (!location) continue
      const yearMonth = yearMonthInZone(o.closedAt ?? o.createdAt, tz)
      for (const li of o.lineItems ?? []) {
        lines.push({
          orderId: o.id,
          artistCategoryId: li.catalogObjectId ? (varToArtist.get(li.catalogObjectId) ?? null) : null,
          yearMonth,
          itemType: commissionItemType(li.variationName),
          location,
          grossCents: toCents(li.grossSalesMoney?.amount),
          discountCents: toCents(li.totalDiscountMoney?.amount),
          refundCents: 0 // v1: pre-refund (see file header)
        })
      }
    }
    cursor = (resp as { cursor?: string }).cursor
  } while (cursor)

  return aggregateLines(lines)
}
