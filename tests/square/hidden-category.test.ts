import { afterEach, describe, expect, it } from 'vitest'
import { getHiddenCategoryIds, isHiddenByCategory } from '@/lib/square/items'

const original = process.env.HIDDEN_CATEGORY_IDS
afterEach(() => {
  process.env.HIDDEN_CATEGORY_IDS = original
})

describe('hidden-category filter', () => {
  it('nothing hidden when env is empty/absent', () => {
    process.env.HIDDEN_CATEGORY_IDS = ''
    expect(getHiddenCategoryIds().size).toBe(0)
    expect(isHiddenByCategory(['CAT_A'])).toBe(false)
  })

  it('parses a comma list (trimmed) and hides on any intersection', () => {
    process.env.HIDDEN_CATEGORY_IDS = ' HIDE_1 , HIDE_2 '
    expect(getHiddenCategoryIds()).toEqual(new Set(['HIDE_1', 'HIDE_2']))
    expect(isHiddenByCategory(['CAT_A', 'HIDE_2'])).toBe(true)
    expect(isHiddenByCategory(['CAT_A', 'CAT_B'])).toBe(false)
    expect(isHiddenByCategory([])).toBe(false)
  })
})
