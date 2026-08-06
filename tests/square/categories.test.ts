import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stable, hand-shaped category fixtures. Mix of CATEGORY and a poison
// non-CATEGORY object to confirm the type filter.
const fixturePage: Array<Record<string, unknown>> = [
  {
    id: 'ART_PARENT',
    type: 'CATEGORY',
    categoryData: { name: 'Artist' }
  },
  {
    id: 'ART_CHILD_A',
    type: 'CATEGORY',
    categoryData: { name: 'Bxnny.Arts', parentCategory: { id: 'ART_PARENT' } }
  },
  {
    id: 'ART_CHILD_B',
    type: 'CATEGORY',
    categoryData: { name: 'Addham', parentCategory: { id: 'ART_PARENT' } }
  },
  {
    id: 'IP_ANIME',
    type: 'CATEGORY',
    categoryData: { name: 'Anime' }
  },
  {
    id: 'IP_NARUTO',
    type: 'CATEGORY',
    categoryData: { name: 'Naruto', parentCategory: { id: 'IP_ANIME' } }
  },
  {
    // Non-CATEGORY noise; must be filtered out.
    id: 'ITEM_X',
    type: 'ITEM',
    itemData: { name: 'Some Print' }
  }
]

vi.mock('square', () => {
  class SquareClient {
    catalog = {
      // Single-page result (no cursor) — mirrors catalog.search's shape.
      search: async (_args: unknown) => ({ objects: fixturePage, cursor: undefined })
    }
    constructor(public readonly config: { token: string; environment: string }) {}
  }
  return {
    SquareClient,
    SquareEnvironment: { Sandbox: 'sandbox', Production: 'production' }
  }
})

// Stub Next.js's unstable_cache so it just runs the inner function each call —
// otherwise different tests within this file would share cached state.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn
}))

describe('square categories helper', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ACCESS_TOKEN', 'fake_sandbox_token_for_test')
    vi.stubEnv('SQUARE_ENV', 'sandbox')
    vi.stubEnv('SQUARE_WEBHOOK_SIGNATURE_KEY', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns only CATEGORY objects, normalized + alpha-sorted by name', async () => {
    const mod = await import('@/lib/square/categories')
    const all = await mod.listCategoriesFromSquare()
    expect(all.map((c) => c.name)).toEqual(['Addham', 'Anime', 'Artist', 'Bxnny.Arts', 'Naruto'])
    // Top-level entries report parentCategoryId === null
    const artistParent = all.find((c) => c.name === 'Artist')
    expect(artistParent?.parentCategoryId).toBeNull()
    const animeParent = all.find((c) => c.name === 'Anime')
    expect(animeParent?.parentCategoryId).toBeNull()
    // Children point at their parents
    const bxnny = all.find((c) => c.name === 'Bxnny.Arts')
    expect(bxnny?.parentCategoryId).toBe('ART_PARENT')
  })

  it('getArtistSubCategories filters to children of the Artist parent', async () => {
    const mod = await import('@/lib/square/categories')
    const subs = await mod.getArtistSubCategories()
    expect(subs.map((c) => c.name).sort()).toEqual(['Addham', 'Bxnny.Arts'])
    expect(subs.every((c) => c.parentCategoryId === 'ART_PARENT')).toBe(true)
  })

  it('getCategoryNameMap returns id → name for every CATEGORY', async () => {
    const mod = await import('@/lib/square/categories')
    const map = await mod.getCategoryNameMap()
    expect(map.get('ART_PARENT')).toBe('Artist')
    expect(map.get('IP_NARUTO')).toBe('Naruto')
    expect(map.size).toBe(5) // ITEM_X must NOT appear
    expect(map.has('ITEM_X')).toBe(false)
  })

  it('getArtistParentCategoryId resolves by name (not by hard-coded id)', async () => {
    const mod = await import('@/lib/square/categories')
    const id = await mod.getArtistParentCategoryId()
    expect(id).toBe('ART_PARENT')
  })
})
