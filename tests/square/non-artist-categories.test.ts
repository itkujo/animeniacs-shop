import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hand-shaped category fixture: an Artist parent with two children, an
// IP top-level (Anime) with two children. getNonArtistCategories should
// strip the Artist parent + its children and keep Anime + its children.
const fixturePage: Array<Record<string, unknown>> = [
  {
    id: 'ART_PARENT',
    type: 'CATEGORY',
    categoryData: { name: 'Artist' }
  },
  {
    id: 'ART_KID_1',
    type: 'CATEGORY',
    categoryData: { name: 'Bxnny.Arts', parentCategory: { id: 'ART_PARENT' } }
  },
  {
    id: 'ART_KID_2',
    type: 'CATEGORY',
    categoryData: { name: 'Sketched_Reality', parentCategory: { id: 'ART_PARENT' } }
  },
  {
    id: 'IP_TOP',
    type: 'CATEGORY',
    categoryData: { name: 'Anime' }
  },
  {
    id: 'IP_KID_1',
    type: 'CATEGORY',
    categoryData: { name: 'Naruto', parentCategory: { id: 'IP_TOP' } }
  },
  {
    id: 'IP_KID_2',
    type: 'CATEGORY',
    categoryData: { name: 'One Piece', parentCategory: { id: 'IP_TOP' } }
  }
]

// Defensive-case fixture (no Artist parent present).
const fixturePageNoArtist: Array<Record<string, unknown>> = [
  { id: 'A', type: 'CATEGORY', categoryData: { name: 'Anime' } },
  {
    id: 'B',
    type: 'CATEGORY',
    categoryData: { name: 'Naruto', parentCategory: { id: 'A' } }
  }
]

// `currentPage` is swapped per-test by tests that need the defensive case.
let currentPage: Array<Record<string, unknown>> = fixturePage

vi.mock('square', () => {
  class SquareClient {
    catalog = {
      search: async (_args: unknown) => ({ objects: currentPage, cursor: undefined })
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

describe('getNonArtistCategories', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ACCESS_TOKEN', 'fake_sandbox_token_for_test')
    vi.stubEnv('SQUARE_ENV', 'sandbox')
    vi.stubEnv('SQUARE_WEBHOOK_SIGNATURE_KEY', undefined)
    currentPage = fixturePage
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('excludes the Artist parent and every Artist sub-category', async () => {
    const { getNonArtistCategories } = await import('@/lib/square/categories')
    const result = await getNonArtistCategories()
    const ids = result.map((c) => c.id).sort()
    expect(ids).toEqual(['IP_KID_1', 'IP_KID_2', 'IP_TOP'])
  })

  it('returns everything when no Artist parent exists (defensive)', async () => {
    currentPage = fixturePageNoArtist
    const { getNonArtistCategories } = await import('@/lib/square/categories')
    const result = await getNonArtistCategories()
    expect(result.map((c) => c.id).sort()).toEqual(['A', 'B'])
  })
})

describe('buildHierarchicalLabel', () => {
  it('builds "Anime > Naruto" for a 2-level category', async () => {
    const { buildHierarchicalLabel } = await import('@/lib/square/categories')
    const allById = new Map([
      ['A', { id: 'A', name: 'Anime', parentCategoryId: null }],
      ['B', { id: 'B', name: 'Naruto', parentCategoryId: 'A' }]
    ])
    expect(buildHierarchicalLabel(allById.get('B')!, allById)).toBe('Anime > Naruto')
  })

  it('returns just the name for a root-level category', async () => {
    const { buildHierarchicalLabel } = await import('@/lib/square/categories')
    const allById = new Map([['A', { id: 'A', name: 'Anime', parentCategoryId: null }]])
    expect(buildHierarchicalLabel(allById.get('A')!, allById)).toBe('Anime')
  })

  it('breaks cycles (defensive against malformed data)', async () => {
    const { buildHierarchicalLabel } = await import('@/lib/square/categories')
    const allById = new Map([
      ['A', { id: 'A', name: 'A', parentCategoryId: 'B' }],
      ['B', { id: 'B', name: 'B', parentCategoryId: 'A' }]
    ])
    // Should terminate without throwing; exact format doesn't matter,
    // just that it ends.
    const label = buildHierarchicalLabel(allById.get('A')!, allById)
    expect(typeof label).toBe('string')
  })
})
