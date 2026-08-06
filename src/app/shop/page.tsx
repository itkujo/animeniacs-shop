import { ProductCard } from '@/components/product/ProductCard'
import { Pagination } from '@/components/shop/Pagination'
import { type FilterOption, ShopFilters } from '@/components/shop/ShopFilters'
import { getActiveArtists } from '@/lib/db/queries/artists'
import { getPublicIpNicknames } from '@/lib/db/queries/ip-nicknames'
import { getReviewSummariesForProducts } from '@/lib/db/queries/reviews'
import { filterAndSortProducts, paginate } from '@/lib/shop/filter'
import { type RawSearchParams, parseShopParams } from '@/lib/shop/parse-params'
import { buildCategorySearchIndex, listCategoriesFromSquare } from '@/lib/square/categories'
import { getShopProducts } from '@/lib/square/items'

// Reads the live Square catalog + DB at request time and branches on
// searchParams, so the route must stay dynamic (no build-time prerender,
// which would try to reach Square / Postgres during build). Phase 7.5/B.6.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Shop | Animeniacs',
  description: 'Browse the full collection.'
}

const PAGE_SIZE = 24

export default async function ShopPage({
  searchParams
}: {
  searchParams: RawSearchParams
}): Promise<JSX.Element> {
  const [products, nicknames, artists] = await Promise.all([
    getShopProducts(),
    getPublicIpNicknames(),
    getActiveArtists()
  ])

  // Filter options come ONLY from the curated public sources (public IP
  // nicknames + active artists) — never raw Square category names.
  const categoryOptions: FilterOption[] = nicknames.map((n) => ({
    slug: n.slug,
    label: n.nickname
  }))
  const artistOptions: FilterOption[] = artists.map((a) => ({
    slug: a.slug,
    label: a.displayName
  }))

  const query = parseShopParams(searchParams ?? {})
  // Resolve the slug filters to their Square category ids using the same
  // curated lists the dropdowns are built from. Unknown slugs resolve to null
  // (the filter is then a no-op), so junk values can never error.
  query.categoryId = nicknames.find((n) => n.slug === query.categorySlug)?.squareCategoryId ?? null
  query.artistCategoryId =
    artists.find((a) => a.slug === query.artistSlug)?.squareCategoryId ?? null

  const summaries = await getReviewSummariesForProducts(products.map((p) => p.id))

  // Only when searching: build the server-side category-name index so a query
  // like "One Piece" matches items in that category (and its parent chain).
  // Names never reach the client — the index is consumed here and only filtered
  // products are rendered. Best-effort: if categories can't be fetched, search
  // silently falls back to name-only.
  let categorySearch: Map<string, string> | undefined
  if (query.q) {
    try {
      categorySearch = buildCategorySearchIndex(await listCategoriesFromSquare())
    } catch {
      categorySearch = undefined
    }
  }

  const filtered = filterAndSortProducts(products, summaries, query, categorySearch)
  const { pageItems, page, pageCount, total } = paginate(filtered, query.page, PAGE_SIZE)

  // Active params (string form) so Pagination preserves filter/sort state.
  const paginationParams: Record<string, string | undefined> = {
    q: query.q ?? undefined,
    category: query.categorySlug ?? undefined,
    artist: query.artistSlug ?? undefined,
    min: query.minCents !== null ? (query.minCents / 100).toString() : undefined,
    max: query.maxCents !== null ? (query.maxCents / 100).toString() : undefined,
    sort: query.sort ?? undefined
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <header className="mb-8">
        <p className="eyebrow">The full catalog</p>
        <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Shop</h1>
        <p className="mt-2 text-muted">Browse the full collection.</p>
      </header>

      <ShopFilters categories={categoryOptions} artists={artistOptions} query={query} />

      {total === 0 ? (
        <section className="rounded-lg border border-line bg-wall p-10 text-center text-muted">
          <p>
            {products.length === 0
              ? 'No products available yet — check back soon.'
              : 'No products match your filters.'}
          </p>
        </section>
      ) : (
        <section>
          <h2 className="sr-only">Products</h2>
          <p className="mb-5 font-mono text-sm text-faint">
            {total} product{total === 1 ? '' : 's'}
          </p>
          <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {pageItems.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} rating={summaries.get(p.id)} />
              </li>
            ))}
          </ul>
          <Pagination page={page} pageCount={pageCount} params={paginationParams} />
        </section>
      )}
    </div>
  )
}
