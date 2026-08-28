import type { ArtistInput } from '@/lib/db/queries/artists'

/**
 * Pull a string field out of FormData, returning null for empty values.
 * The admin form uses `null` to express "this optional field is unset"
 * rather than empty string — matches the schema (text columns are
 * nullable and the Zod schema accepts null for the optional URL fields).
 */
function getNullable(form: FormData, key: string): string | null {
  const v = form.get(key)
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length === 0 ? null : trimmed
}

function getRequired(form: FormData, key: string): string {
  const v = form.get(key)
  if (typeof v !== 'string') return ''
  return v.trim()
}

export interface ParsedArtistFormData {
  /** The artist-input fields ready to hand to createArtist/updateArtist. */
  input: ArtistInput
  /** The avatar File, if the operator uploaded one (empty otherwise). */
  avatarFile: File | null
}

/**
 * Translates a multipart FormData payload from the admin form into the
 * ArtistInput shape that the query helpers accept. Does NOT validate;
 * the query helper does that via ArtistInputSchema.parse.
 *
 * The avatarUrl field is filled in by the server action AFTER calling
 * saveAvatar() — this function leaves it null/unset so the action can
 * inject the URL.
 */
export function parseArtistForm(form: FormData): ParsedArtistFormData {
  const avatarFileRaw = form.get('avatarFile')
  const avatarFile = avatarFileRaw instanceof File && avatarFileRaw.size > 0 ? avatarFileRaw : null

  const input: ArtistInput = {
    slug: getRequired(form, 'slug'),
    displayName: getRequired(form, 'displayName'),
    squareCategoryId: getRequired(form, 'squareCategoryId'),
    status: (getRequired(form, 'status') as 'active' | 'inactive') || 'active',
    bio: getNullable(form, 'bio'),
    instagram: getNullable(form, 'instagram'),
    twitter: getNullable(form, 'twitter'),
    facebook: getNullable(form, 'facebook'),
    youtube: getNullable(form, 'youtube'),
    tiktok: getNullable(form, 'tiktok'),
    website: getNullable(form, 'website'),
    commissionRate: getRequired(form, 'commissionRate') || '0.2000',
    paymentMethod: getNullable(form, 'paymentMethod'),
    paymentEmail: getNullable(form, 'paymentEmail'),
    accountEmail: getNullable(form, 'accountEmail'),
    notes: getNullable(form, 'notes')
  }

  return { input, avatarFile }
}
