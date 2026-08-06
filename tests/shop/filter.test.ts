import type { ReviewSummary } from '@/lib/db/queries/reviews'
import { filterAndSortProducts, paginate } from '@/lib/shop/filter'
import type { ShopQuery } from '@/lib/shop/parse-params'
import type { ArtistProduct } from '@/lib/square/items'
import { describe, expect, it } from 'vitest'

function p(over: Partial<ArtistProduct> & { id: string }): ArtistProduct {
  return {
    id: over.id,
    name: over.name ?? over.id,
    imageUrl: over.imageUrl ?? null,
    priceCents: over.priceCents ?? null,
    categoryIds: over.categoryIds ?? [],
    updatedAt: over.updatedAt ?? null
  }
}

const baseQuery: ShopQuery = {
  q: null,
  categorySlug: null,
  artistSlug: null,
  categoryId: null,
  artistCategoryId: null,
  minCents: null,
  maxCents: null,
  sort: null,
  page: 1
}

function q(over: Partial<ShopQuery>): ShopQuery {
  return { ...baseQuery, ...over }
}

const noSummaries = new Map<string, ReviewSummary>()

describe('filterAndSortProducts', () => {
  it('filters by case-insensitive name substring', () => {
    const products = [p({ id: '1', name: 'Naruto Poster' }), p({ id: '2', name: 'Goku Mug' })]
    const out = filterAndSortProducts(products, noSummaries, q({ q: 'naru' }))
    expect(out.map((x) => x.id)).toEqual(['1'])
  })

  it('search matches an item by its category name/ancestry without a name match', () => {
    // "Spider-Man" leaf whose ancestry text includes its parents (Marvel, Comics).
    const categorySearch = new Map<string, string>([['SPIDEY', 'spider-man marvel comics']])
    const products = [
      p({ id: '1', name: 'Iron Spider', categoryIds: ['SPIDEY'] }),
      p({ id: '2', name: 'Random Poster', categoryIds: ['OTHER'] })
    ]
    // Searching the parent term "marvel" surfaces the item even though its name
    // doesn't contain it; the unrelated product is excluded.
    const out = filterAndSortProducts(products, noSummaries, q({ q: 'marvel' }), categorySearch)
    expect(out.map((x) => x.id)).toEqual(['1'])
  })

  it('without a category index, search is name-only (no accidental category match)', () => {
    const products = [p({ id: '1', name: 'Iron Spider', categoryIds: ['SPIDEY'] })]
    const out = filterAndSortProducts(products, noSummaries, q({ q: 'marvel' }))
    expect(out).toEqual([])
  })

  it('filters by resolved categoryId (containment)', () => {
    const products = [
      p({ id: '1', categoryIds: ['CAT_A', 'CAT_B'] }),
      p({ id: '2', categoryIds: ['CAT_C'] })
    ]
    const out = filterAndSortProducts(products, noSummaries, q({ categoryId: 'CAT_B' }))
    expect(out.map((x) => x.id)).toEqual(['1'])
  })

  it('filters by resolved artistCategoryId (containment)', () => {
    const products = [
      p({ id: '1', categoryIds: ['CAT_ART'] }),
      p({ id: '2', categoryIds: ['CAT_X'] })
    ]
    const out = filterAndSortProducts(products, noSummaries, q({ artistCategoryId: 'CAT_ART' }))
    expect(out.map((x) => x.id)).toEqual(['1'])
  })

  it('applies price bounds in cents', () => {
    const products = [
      p({ id: 'lo', priceCents: 500 }),
      p({ id: 'mid', priceCents: 2500 }),
      p({ id: 'hi', priceCents: 9000 })
    ]
    const out = filterAndSortProducts(products, noSummaries, q({ minCents: 1000, maxCents: 5000 }))
    expect(out.map((x) => x.id)).toEqual(['mid'])
  })

  it('excludes null-price products ONLY when a bound is set', () => {
    const products = [
      p({ id: 'priced', priceCents: 2500 }),
      p({ id: 'variable', priceCents: null })
    ]
    // no bound → null-price kept
    expect(
      filterAndSortProducts(products, noSummaries, q({}))
        .map((x) => x.id)
        .sort()
    ).toEqual(['priced', 'variable'])
    // bound set → null-price dropped
    expect(
      filterAndSortProducts(products, noSummaries, q({ minCents: 1000 })).map((x) => x.id)
    ).toEqual(['priced'])
  })

  it('sorts by rating desc, tie-broken by count desc', () => {
    const products = [p({ id: 'a' }), p({ id: 'b' }), p({ id: 'c' })]
    const summaries = new Map<string, ReviewSummary>([
      ['a', { count: 3, average: 4.5 }],
      ['b', { count: 10, average: 4.5 }],
      ['c', { count: 1, average: 5 }]
    ])
    const out = filterAndSortProducts(products, summaries, q({ sort: 'rating' }))
    expect(out.map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts price_asc with null prices last', () => {
    const products = [
      p({ id: 'n', priceCents: null }),
      p({ id: 'hi', priceCents: 9000 }),
      p({ id: 'lo', priceCents: 500 })
    ]
    const out = filterAndSortProducts(products, noSummaries, q({ sort: 'price_asc' }))
    expect(out.map((x) => x.id)).toEqual(['lo', 'hi', 'n'])
  })

  it('sorts price_desc with null prices last', () => {
    const products = [
      p({ id: 'n', priceCents: null }),
      p({ id: 'hi', priceCents: 9000 }),
      p({ id: 'lo', priceCents: 500 })
    ]
    const out = filterAndSortProducts(products, noSummaries, q({ sort: 'price_desc' }))
    expect(out.map((x) => x.id)).toEqual(['hi', 'lo', 'n'])
  })

  it('sorts newest by updatedAt desc, nulls last', () => {
    const products = [
      p({ id: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
      p({ id: 'new', updatedAt: '2026-06-01T00:00:00Z' }),
      p({ id: 'none', updatedAt: null })
    ]
    const out = filterAndSortProducts(products, noSummaries, q({ sort: 'newest' }))
    expect(out.map((x) => x.id)).toEqual(['new', 'old', 'none'])
  })

  it('defaults to alpha-by-name sort', () => {
    const products = [p({ id: '1', name: 'Banana' }), p({ id: '2', name: 'apple' })]
    const out = filterAndSortProducts(products, noSummaries, q({}))
    expect(out.map((x) => x.name)).toEqual(['apple', 'Banana'])
  })

  it('combines filters (name + price + category)', () => {
    const products = [
      p({ id: '1', name: 'Naruto Poster', priceCents: 2500, categoryIds: ['CAT_A'] }),
      p({ id: '2', name: 'Naruto Mug', priceCents: 50000, categoryIds: ['CAT_A'] }),
      p({ id: '3', name: 'Goku Poster', priceCents: 2500, categoryIds: ['CAT_A'] })
    ]
    const out = filterAndSortProducts(
      products,
      noSummaries,
      q({ q: 'naruto', maxCents: 10000, categoryId: 'CAT_A' })
    )
    expect(out.map((x) => x.id)).toEqual(['1'])
  })

  it('does not mutate the input array', () => {
    const products = [p({ id: 'b', name: 'B' }), p({ id: 'a', name: 'A' })]
    const before = products.map((x) => x.id)
    filterAndSortProducts(products, noSummaries, q({}))
    expect(products.map((x) => x.id)).toEqual(before)
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 50 }, (_, i) => i)

  it('returns the requested window + page math', () => {
    const r = paginate(items, 2, 24)
    expect(r.page).toBe(2)
    expect(r.pageCount).toBe(3)
    expect(r.total).toBe(50)
    expect(r.pageItems).toEqual(items.slice(24, 48))
  })

  it('clamps an out-of-range page to the last page', () => {
    const r = paginate(items, 99, 24)
    expect(r.page).toBe(3)
    expect(r.pageItems).toEqual(items.slice(48, 50))
  })

  it('clamps a page below 1 to 1', () => {
    const r = paginate(items, 0, 24)
    expect(r.page).toBe(1)
    expect(r.pageItems).toEqual(items.slice(0, 24))
  })

  it('handles empty input (pageCount 1, page 1, empty window)', () => {
    const r = paginate([], 1, 24)
    expect(r).toEqual({ pageItems: [], page: 1, pageCount: 1, total: 0 })
  })
})
