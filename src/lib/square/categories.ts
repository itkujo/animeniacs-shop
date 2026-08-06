import 'server-only'
import { unstable_cache as cache } from 'next/cache'
import { getSquareClient } from './client'

export interface SquareCategory {
  id: string
  name: string
  parentCategoryId: string | null
}

/**
 * Production "Artist" parent category id, recorded from the production survey
 * for human reference. Not used at runtime — `getArtistSubCategories()`
 * discovers the parent dynamically by name (see note below), because the
 * sandbox mirror produces fresh ids that don't match production.
 *
 * Smoke-tested 2026-05-15 against sandbox: Artist parent id is
 * `73TDV4ACNYMCZ4G3E7XONXSE` there, not the prod id below.
 */
export const ARTIST_PARENT_CATEGORY_ID_PRODUCTION = 'B6I2KLCRDEHSF6XHODMNSG6P'

/** Name used to locate the Artist parent category in either environment. */
export const ARTIST_PARENT_CATEGORY_NAME = 'Artist'

/**
 * Lists every CATEGORY in the catalog, normalized to a flat shape.
 * Cached for 5 minutes in-process via Next.js `unstable_cache`.
 */
export const listCategoriesFromSquare = cache(
  async (): Promise<SquareCategory[]> => {
    const client = getSquareClient()
    const out: SquareCategory[] = []
    const page = await client.catalog.list({ types: 'CATEGORY' })
    for await (const obj of page) {
      // biome-ignore lint/suspicious/noExplicitAny: SDK union is awkward; narrow via `type === 'CATEGORY'`
      const c: any = obj
      if (c.type !== 'CATEGORY') continue
      out.push({
        id: c.id,
        name: c.categoryData?.name ?? '(unnamed)',
        parentCategoryId: c.categoryData?.parentCategory?.id ?? null
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  },
  ['square-categories-list'],
  { revalidate: 300 }
)

/**
 * Returns the id of the top-level "Artist" category, or null if absent.
 *
 * Discovers by name + null-parent rather than by hard-coded id because
 * `pnpm sq:mirror` generates fresh ids in sandbox; the production id
 * (`ARTIST_PARENT_CATEGORY_ID_PRODUCTION` above) is for documentation
 * only.
 */
export async function getArtistParentCategoryId(): Promise<string | null> {
  const all = await listCategoriesFromSquare()
  const match = all.find(
    (c) => c.name === ARTIST_PARENT_CATEGORY_NAME && c.parentCategoryId === null
  )
  return match?.id ?? null
}

/** Filtered to children of the Artist parent category. */
export async function getArtistSubCategories(): Promise<SquareCategory[]> {
  const all = await listCategoriesFromSquare()
  const parentId = all.find(
    (c) => c.name === ARTIST_PARENT_CATEGORY_NAME && c.parentCategoryId === null
  )?.id
  if (!parentId) return []
  return all.filter((c) => c.parentCategoryId === parentId)
}

/** Map of categoryId → name for the IP / breadcrumb path. */
export async function getCategoryNameMap(): Promise<Map<string, string>> {
  const all = await listCategoriesFromSquare()
  return new Map(all.map((c) => [c.id, c.name]))
}

/**
 * Every category that is NOT the Artist parent and NOT one of its
 * children. Used by the IP-nicknames admin to assign nicknames to
 * non-artist categories.
 *
 * If the Artist parent doesn't exist (test fixture / fresh sandbox),
 * returns the full list — defensive, matches the principle that
 * absence-of-Artist means there are no Artist sub-categories to exclude.
 */
export async function getNonArtistCategories(): Promise<SquareCategory[]> {
  const all = await listCategoriesFromSquare()
  const parentId = all.find(
    (c) => c.name === ARTIST_PARENT_CATEGORY_NAME && c.parentCategoryId === null
  )?.id
  if (!parentId) return all
  return all.filter((c) => c.id !== parentId && c.parentCategoryId !== parentId)
}

/**
 * Server-only search index: categoryId → lowercased text of the category's OWN
 * name plus every ancestor name up the parentCategoryId chain (e.g. a "Spider-Man"
 * leaf → "spider-man marvel comics"). Lets the shop search match IP/category terms
 * ("One Piece", "Marvel") against an item's categories WITHOUT exposing any name
 * to the client — the index is built and consumed server-side; only the filtered
 * product list ever reaches the browser (IP-never-public stays intact). Cycle-safe.
 */
export function buildCategorySearchIndex(cats: SquareCategory[]): Map<string, string> {
  const byId = new Map(cats.map((c) => [c.id, c]))
  const index = new Map<string, string>()
  for (const c of cats) {
    const parts: string[] = []
    const seen = new Set<string>()
    let cur: SquareCategory | undefined = c
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      parts.push(cur.name)
      cur = cur.parentCategoryId ? byId.get(cur.parentCategoryId) : undefined
    }
    index.set(c.id, parts.join(' ').toLowerCase())
  }
  return index
}

/**
 * Walks parentCategoryId up the chain, joining names with ` > `.
 * Used to build hierarchical labels for the IP category picker.
 * Detects cycles (returns the partial chain it has so far).
 */
export function buildHierarchicalLabel(
  category: SquareCategory,
  allById: Map<string, SquareCategory>
): string {
  const parts: string[] = [category.name]
  const seen = new Set<string>([category.id])
  let current = category
  while (current.parentCategoryId) {
    if (seen.has(current.parentCategoryId)) break // cycle guard
    const parent = allById.get(current.parentCategoryId)
    if (!parent) break
    parts.unshift(parent.name)
    seen.add(parent.id)
    current = parent
  }
  return parts.join(' > ')
}
