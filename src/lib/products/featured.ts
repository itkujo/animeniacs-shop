import 'server-only'
import { db } from '@/lib/db/client'
import { productCache } from '@/lib/db/schema'
import type { CachedProduct } from '@/lib/square/types'
import { type ArtistProduct, getHiddenCategoryIds, getShopProducts, isHiddenByCategory } from '@/lib/square/items'
import { desc } from 'drizzle-orm'

/**
 * Source for the homepage "latest drops" rail. The storefront should never show
 * an empty front door, so this degrades gracefully:
 *
 *   1. Square (`getShopProducts`) is the live source of truth in production.
 *   2. If Square is unreachable/unconfigured OR returns nothing, fall back to
 *      the durable `product_cache` table (warmed by PDP read-throughs; seeded in
 *      local dev). Better a slightly-stale rail than a blank hero.
 *   3. During `next build` (prerender, no DB/Square reachable) return [] so the
 *      page builds; it re-renders with real data at runtime via ISR.
 *
 * Ordering is newest-first ("drops"), by Square `updatedAt`.
 */
export async function getFeaturedProducts(limit = 12): Promise<ArtistProduct[]> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return []

  try {
    const all = await getShopProducts()
    if (all.length > 0) return sortNewest(all).slice(0, limit)
  } catch {
    // Square unconfigured/unreachable — fall through to the cache.
  }

  return fromCache(limit)
}

function sortNewest(products: ArtistProduct[]): ArtistProduct[] {
  return [...products].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

/** Project `product_cache` rows into the public card shape, newest first. */
async function fromCache(limit: number): Promise<ArtistProduct[]> {
  try {
    const rows = await db
      .select()
      .from(productCache)
      .orderBy(desc(productCache.updatedAt))
      .limit(limit)

    const hidden = getHiddenCategoryIds()
    return rows
      .map((row) => {
        const data = row.data as CachedProduct
        let priceCents: number | null = null
        for (const v of data.variations ?? []) {
          const amount = v.price?.amount
          if (typeof amount === 'number' && (priceCents === null || amount < priceCents)) {
            priceCents = amount
          }
        }
        return {
          id: data.id,
          name: data.name,
          imageUrl: data.images?.[0] ?? null,
          priceCents,
          categoryIds: data.categoryIds ?? [],
          updatedAt: data.updatedAt ?? null
        } satisfies ArtistProduct
      })
      .filter((p) => !isHiddenByCategory(p.categoryIds, hidden))
  } catch {
    return []
  }
}
