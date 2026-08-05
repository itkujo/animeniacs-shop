import 'server-only'
import { artImageUrl } from '@/lib/images/art-url'
import { unstable_cache as cache } from 'next/cache'
import { getSquareClient } from './client'

/**
 * Public-facing product card shape. A minimal projection of the Square
 * `CatalogItem` containing only the bits the artist-page grid needs.
 *
 * Phase 4 ships this in isolation; Phase 5's full PDP will surface the
 * larger CachedProduct shape from src/lib/square/types.ts.
 */
export interface ArtistProduct {
  id: string
  name: string
  /** First image URL, if any. Square returns presigned CDN URLs. */
  imageUrl: string | null
  /** Lowest variation price in cents (USD), or null if variable / not set. */
  priceCents: number | null
  /** Square category IDs the item belongs to. Useful for downstream filters. */
  categoryIds: string[]
  /** ISO timestamp of the item's last Square update, or null. Drives `newest` sort. */
  updatedAt: string | null
}

/**
 * Square category ids whose items are hidden from the ENTIRE storefront (grid,
 * category pages, PDP, related, home rail). Comma-separated in
 * HIDDEN_CATEGORY_IDS; empty/absent = nothing hidden. Hiding/unhiding an item
 * is a Square-dashboard action (assign/remove the category) — no redeploy.
 */
export function getHiddenCategoryIds(): Set<string> {
  return new Set(
    (process.env.HIDDEN_CATEGORY_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

/** True if any of the item's categories is a hidden category. */
export function isHiddenByCategory(
  categoryIds: string[],
  hidden: Set<string> = getHiddenCategoryIds()
): boolean {
  return hidden.size > 0 && categoryIds.some((id) => hidden.has(id))
}

/**
 * Square's `batchGet` caps at ~1000 object ids per call; ids beyond the cap are
 * silently dropped. This resolves IMAGE urls for any number of image ids by
 * chunking into batches of <= 900 (safely under the cap), awaiting each, and
 * merging the results into one `Map<imageId, url>`. Empty input does no I/O.
 *
 * Behavior-preserving at current scale (a single batch) and correct beyond the
 * cap. Shared by `getItemsByCategoryId` and `getShopProducts`.
 */
export async function resolveImageUrls(
  client: ReturnType<typeof getSquareClient>,
  imageIds: string[]
): Promise<Map<string, string>> {
  const imageUrlById = new Map<string, string>()
  if (imageIds.length === 0) return imageUrlById

  const CHUNK_SIZE = 900
  for (let i = 0; i < imageIds.length; i += CHUNK_SIZE) {
    const slice = imageIds.slice(i, i + CHUNK_SIZE)
    const imageBatch = await client.catalog.batchGet({
      objectIds: slice,
      includeRelatedObjects: false
    })
    // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
    const imgObjects: any[] = (imageBatch as any).objects ?? []
    for (const img of imgObjects) {
      if (img.type === 'IMAGE' && typeof img.imageData?.url === 'string') {
        imageUrlById.set(img.id, img.imageData.url)
      }
    }
  }
  return imageUrlById
}

/**
 * Resolve ONE Square IMAGE object id → its current presigned CDN url, for the
 * art proxy (`/api/art`). Cached per id (~50 min, under the presigned-url
 * lifetime) so the proxy doesn't `batchGet` on every image request and recovers
 * automatically when a url rotates. Returns null if the id isn't a live IMAGE.
 */
export const resolveImageUrlCached = cache(
  async (id: string): Promise<string | null> => {
    const map = await resolveImageUrls(getSquareClient(), [id])
    return map.get(id) ?? null
  },
  ['square-image-url'],
  { revalidate: 3000 }
)

/**
 * Returns active (non-archived) catalog items whose `categories[]`
 * contains the given category id. Image URLs are resolved by fetching
 * each referenced IMAGE object.
 *
 * Implementation choices:
 *   - Uses `searchItems({ categoryIds: [...] })` which is the Square
 *     SDK's documented happy path for category-filtered item listings.
 *   - Filters out archived items in code (search returns them as well).
 *   - Resolves images via `batchGet` so a single round-trip pulls every
 *     referenced IMAGE for the whole result page.
 *   - Cached per-category-id for 60 seconds so a page reload while
 *     browsing doesn't re-hit Square. Aggressive invalidation isn't
 *     needed because the admin actions revalidate `/artist/<slug>`
 *     after edits, and Square's catalog itself isn't being edited
 *     from the app side.
 */
export const getItemsByCategoryId = cache(
  async (categoryId: string): Promise<ArtistProduct[]> => {
    if (!categoryId) return []
    const client = getSquareClient()

    const search = await client.catalog.searchItems({
      categoryIds: [categoryId],
      limit: 100
    })

    // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
    const items: any[] = (search as any).items ?? []

    // Filter out archived items.
    const active = items.filter((it) => it.itemData?.isArchived !== true)

    if (active.length === 0) return []

    // Project to our public shape. Images are referenced by Square image id via
    // the art proxy (the original url is never sent to the client), so no
    // per-page url resolution is needed here.
    const out: ArtistProduct[] = []
    for (const it of active) {
      const itemData = it.itemData ?? {}
      const firstImageId: string | undefined = itemData.imageIds?.[0]
      const variations: Array<Record<string, unknown>> = itemData.variations ?? []

      // Lowest price across variations (skipping VARIABLE_PRICING).
      let priceCents: number | null = null
      for (const v of variations) {
        // biome-ignore lint/suspicious/noExplicitAny: SDK
        const vd: any = (v as any).itemVariationData
        if (!vd || vd.pricingType !== 'FIXED_PRICING') continue
        const amount = vd.priceMoney?.amount
        if (typeof amount === 'bigint' || typeof amount === 'number') {
          const cents = Number(amount)
          if (priceCents === null || cents < priceCents) priceCents = cents
        }
      }

      const categoryIds: string[] = (itemData.categories ?? [])
        // biome-ignore lint/suspicious/noExplicitAny: SDK
        .map((c: any) => c.id)
        .filter((id: unknown): id is string => typeof id === 'string')

      out.push({
        id: it.id,
        name: itemData.name ?? '(unnamed)',
        imageUrl: firstImageId ? artImageUrl(firstImageId) : null,
        priceCents,
        categoryIds,
        updatedAt: typeof it.updatedAt === 'string' ? it.updatedAt : null
      })
    }

    // Drop items in a hidden category, then sort alphabetically for stable order.
    const hidden = getHiddenCategoryIds()
    const visible = out.filter((p) => !isHiddenByCategory(p.categoryIds, hidden))
    visible.sort((a, b) => a.name.localeCompare(b.name))
    return visible
  },
  ['square-items-by-category'],
  { revalidate: 60 }
)

/**
 * Returns ALL active (non-archived) catalog items, projected to the
 * public ArtistProduct shape. Used by the /shop listing page (Phase 8).
 *
 * Unlike getItemsByCategoryId this passes NO categoryIds, so it returns
 * the entire active catalog. Paginates via the response cursor. Image
 * URLs are batch-resolved per page. Cached 60s like the by-category path.
 *
 * IMPORTANT (IP-never-public): the returned categoryIds are carried for
 * parity with getItemsByCategoryId but MUST NOT be used to render any
 * category name on the public /shop page.
 */
export const getShopProducts = cache(
  async (): Promise<ArtistProduct[]> => {
    const client = getSquareClient()

    // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
    const active: any[] = []
    let cursor: string | undefined
    do {
      const search = await client.catalog.searchItems({
        limit: 100,
        ...(cursor ? { cursor } : {})
      })
      // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
      const items: any[] = (search as any).items ?? []
      for (const it of items) {
        if (it.itemData?.isArchived !== true) active.push(it)
      }
      // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward
      cursor = (search as any).cursor ?? undefined
    } while (cursor)

    if (active.length === 0) return []

    // Images are referenced by Square image id via the art proxy, so no per-page
    // url resolution is needed.
    const byId = new Map<string, ArtistProduct>()
    for (const it of active) {
      if (byId.has(it.id)) continue
      const itemData = it.itemData ?? {}
      const firstImageId: string | undefined = itemData.imageIds?.[0]
      const variations: Array<Record<string, unknown>> = itemData.variations ?? []

      let priceCents: number | null = null
      for (const v of variations) {
        // biome-ignore lint/suspicious/noExplicitAny: SDK
        const vd: any = (v as any).itemVariationData
        if (!vd || vd.pricingType !== 'FIXED_PRICING') continue
        const amount = vd.priceMoney?.amount
        if (typeof amount === 'bigint' || typeof amount === 'number') {
          const cents = Number(amount)
          if (priceCents === null || cents < priceCents) priceCents = cents
        }
      }

      const categoryIds: string[] = (itemData.categories ?? [])
        // biome-ignore lint/suspicious/noExplicitAny: SDK
        .map((c: any) => c.id)
        .filter((id: unknown): id is string => typeof id === 'string')

      byId.set(it.id, {
        id: it.id,
        name: itemData.name ?? '(unnamed)',
        imageUrl: firstImageId ? artImageUrl(firstImageId) : null,
        priceCents,
        categoryIds,
        updatedAt: typeof it.updatedAt === 'string' ? it.updatedAt : null
      })
    }

    const hidden = getHiddenCategoryIds()
    const out = Array.from(byId.values()).filter((p) => !isHiddenByCategory(p.categoryIds, hidden))
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  },
  ['square-shop-items'],
  { revalidate: 60 }
)
