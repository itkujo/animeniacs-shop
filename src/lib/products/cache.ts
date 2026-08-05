import 'server-only'
import { db } from '@/lib/db/client'
import { productCache } from '@/lib/db/schema'
import { artImageUrl } from '@/lib/images/art-url'
import { getSquareClient } from '@/lib/square/client'
import { isHiddenByCategory } from '@/lib/square/items'
import type {
  CachedItemOption,
  CachedItemOptionValue,
  CachedMoney,
  CachedProduct,
  CachedVariation
} from '@/lib/square/types'
import { eq } from 'drizzle-orm'

/**
 * Read-through cache for single-product fetches used by the PDP.
 *
 * Flow:
 *   1. SELECT from product_cache by catalog_item_id.
 *   2. If row exists AND updated_at within TTL → return row.data as CachedProduct.
 *   3. Else: fetch fresh from Square (item + referenced IMAGE + ITEM_OPTION
 *      objects), denormalize, UPSERT into product_cache, return.
 *   4. If Square returns nothing (deleted / not-found) → return null; leave
 *      any stale cache row in place (acceptable v1 per Decision 2).
 */

/** 1 hour. Tune from here post-launch — single source of truth for the TTL. */
export const PRODUCT_CACHE_TTL_MS = 60 * 60 * 1000

interface OptionDef {
  id: string
  name: string
  values: { id: string; name: string }[]
}

interface DenormalizeContext {
  optionDefs: Map<string, OptionDef>
}

/**
 * Projects the raw Square SDK item into the cached shape we store.
 * Exported so unit tests can exercise the projection logic in isolation.
 */
// biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
export function denormalize(sdkItem: any, ctx: DenormalizeContext): CachedProduct {
  const itemData = sdkItem.itemData ?? {}

  // Reference images by Square image id through the art proxy — the original
  // Square url is never stored or sent to the client. Ids come from Square and
  // are trusted here; the /api/art route validates on the untrusted boundary.
  const images: string[] = (itemData.imageIds ?? [])
    .filter((id: unknown): id is string => typeof id === 'string')
    .map((id: string) => artImageUrl(id))

  const categoryIds: string[] = (itemData.categories ?? [])
    // biome-ignore lint/suspicious/noExplicitAny: SDK
    .map((c: any) => c.id)
    .filter((id: unknown): id is string => typeof id === 'string')

  const itemOptionIds: string[] = (itemData.itemOptions ?? [])
    // biome-ignore lint/suspicious/noExplicitAny: SDK
    .map((o: any) => o.itemOptionId)
    .filter((id: unknown): id is string => typeof id === 'string')

  const itemOptions: CachedItemOption[] = itemOptionIds
    .map((id) => ctx.optionDefs.get(id))
    .filter((d): d is OptionDef => d !== undefined)
    .map((d) => ({
      id: d.id,
      name: d.name,
      values: d.values.map((v) => ({ id: v.id, name: v.name }) satisfies CachedItemOptionValue)
    }))

  // biome-ignore lint/suspicious/noExplicitAny: SDK
  const sdkVariations: any[] = itemData.variations ?? []
  const variations: CachedVariation[] = sdkVariations.map((v) => {
    const vd = v.itemVariationData ?? {}
    let price: CachedMoney | null = null
    if (vd.pricingType === 'FIXED_PRICING' && vd.priceMoney?.amount !== undefined) {
      const raw = vd.priceMoney.amount
      const amount = typeof raw === 'bigint' ? Number(raw) : Number(raw)
      price = { amount, currency: vd.priceMoney.currency ?? 'USD' }
    }
    const optionValueIds: string[] = (vd.itemOptionValues ?? [])
      // biome-ignore lint/suspicious/noExplicitAny: SDK
      .map((ov: any) => ov.itemOptionValueId)
      .filter((id: unknown): id is string => typeof id === 'string')

    return {
      id: v.id,
      name: vd.name ?? '(unnamed)',
      price,
      sku: vd.sku ?? null,
      optionValueIds
    }
  })

  return {
    id: sdkItem.id,
    name: itemData.name ?? '(unnamed)',
    description: itemData.description ?? null,
    descriptionHtml: itemData.descriptionHtml ?? null,
    variations,
    images,
    categoryIds,
    itemOptions,
    updatedAt: sdkItem.updatedAt ?? new Date().toISOString()
  }
}

/** Fetch a single item from Square + referenced IMAGE + ITEM_OPTION objects, then denormalize. */
async function refreshFromSquare(itemId: string): Promise<CachedProduct | null> {
  const client = getSquareClient()

  // 1. Fetch the item with related objects so we get IMAGE + ITEM_OPTION in one round trip.
  let itemResp: unknown
  try {
    itemResp = await client.catalog.object.get({
      objectId: itemId,
      includeRelatedObjects: true
    })
  } catch (_e) {
    // 404 / network: treat as miss.
    return null
  }
  // biome-ignore lint/suspicious/noExplicitAny: SDK envelope
  const env = itemResp as any
  const sdkItem = env.object ?? env.result?.object
  if (!sdkItem || sdkItem.type !== 'ITEM') return null
  // biome-ignore lint/suspicious/noExplicitAny: SDK
  const related: any[] = env.relatedObjects ?? env.result?.relatedObjects ?? []

  // Images are referenced by id via the art proxy, so we only need ITEM_OPTION
  // related objects here (not IMAGE urls).
  const optionDefs = new Map<string, OptionDef>()
  for (const r of related) {
    if (r.type === 'ITEM_OPTION') {
      const od = r.itemOptionData ?? {}
      // biome-ignore lint/suspicious/noExplicitAny: SDK
      const values = (od.values ?? []).map((v: any) => ({
        id: v.id,
        name: v.itemOptionValueData?.name ?? '(unnamed)'
      }))
      optionDefs.set(r.id, {
        id: r.id,
        name: od.name ?? '(unnamed)',
        values
      })
    }
  }

  return denormalize(sdkItem, { optionDefs })
}

interface CacheRow {
  data: CachedProduct
  updatedAt: Date
}

async function readFresh(itemId: string): Promise<CacheRow | null> {
  const rows = await db
    .select()
    .from(productCache)
    .where(eq(productCache.catalogItemId, itemId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const age = Date.now() - row.updatedAt.getTime()
  if (age > PRODUCT_CACHE_TTL_MS) return null
  const data = row.data as CachedProduct
  // Bust pre-proxy rows (images stored as raw Square urls) so they repopulate as
  // /api/art proxy urls — avoids a manual product_cache truncate at release.
  if (data.images.some((u) => !u.startsWith('/api/art'))) return null
  return { data, updatedAt: row.updatedAt }
}

async function writeCache(product: CachedProduct): Promise<void> {
  await db
    .insert(productCache)
    .values({ catalogItemId: product.id, data: product, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: productCache.catalogItemId,
      set: { data: product, updatedAt: new Date() }
    })
}

/**
 * Public PDP read path. Returns null when no item exists in Square AND
 * no fresh cache row covers it. A stale cache row past TTL is treated
 * as a miss and triggers re-fetch.
 */
export async function getProductById(itemId: string): Promise<CachedProduct | null> {
  if (!itemId) return null
  const fresh = await readFresh(itemId)
  if (fresh) return isHiddenByCategory(fresh.data.categoryIds) ? null : fresh.data
  const refreshed = await refreshFromSquare(itemId)
  if (!refreshed) return null
  await writeCache(refreshed)
  // Hidden = not on the storefront AND not purchasable: null here 404s the PDP
  // and blocks cart-hydrate / checkout-validate (both read through this fn).
  return isHiddenByCategory(refreshed.categoryIds) ? null : refreshed
}

/**
 * Test-only helper: drops the cache row for an item so the next
 * getProductById() forces a Square fetch. Exported under a __ name
 * to signal "do not use in production code."
 */
export async function __forceRefresh(itemId: string): Promise<void> {
  await db.delete(productCache).where(eq(productCache.catalogItemId, itemId))
}
