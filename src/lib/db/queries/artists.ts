import 'server-only'
import { db } from '@/lib/db/client'
import { type Artist, type NewArtist, artists } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Zod schema for runtime validation of admin form input. Mirrors the
 * Drizzle types but enforces shape at the API boundary.
 *
 * The slug regex allows lowercase letters, digits, dot, and hyphen, with
 * an alphanumeric leading and trailing character (`Bxnny.Arts` becomes
 * `bxnny.arts` once lowercased; `Saru-Print` becomes `saru-print`).
 */
export const ArtistInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/, 'lowercase letters, digits, dot and hyphen'),
  displayName: z.string().min(1).max(120),
  squareCategoryId: z.string().min(1),
  status: z.enum(['active', 'inactive']).default('active'),
  // avatarUrl is NOT a plain z.string().url(): saveAvatar() returns an
  // app-relative path under /public (e.g. /images/uploads/artists/<slug>.webp),
  // which z.string().url() rejects. Accept either an app-relative path
  // (leading "/") or an absolute http(s) URL. The other social fields below
  // stay z.string().url() — those are genuine external URLs.
  avatarUrl: z
    .string()
    .refine((v) => v.startsWith('/') || /^https?:\/\//.test(v), {
      message: 'must be an app-relative path or a URL'
    })
    .nullable()
    .optional(),
  bio: z.string().max(2000).nullable().optional(),
  instagram: z.string().url().nullable().optional(),
  twitter: z.string().url().nullable().optional(),
  facebook: z.string().url().nullable().optional(),
  youtube: z.string().url().nullable().optional(),
  tiktok: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  commissionRate: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v.toString() : v))
    .refine(
      (s) => {
        const n = Number(s)
        return Number.isFinite(n) && n >= 0 && n <= 1
      },
      { message: 'commissionRate must be a decimal between 0 and 1 inclusive' }
    )
    .default('0.2000'),
  paymentMethod: z.string().max(40).nullable().optional(),
  paymentEmail: z.string().max(200).nullable().optional(),
  // Login email linking a signed-in user to this artist's self-serve earnings page.
  accountEmail: z.string().email().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional()
})

/** The shape callers supply. Defaults (e.g. status, commissionRate) are optional here. */
export type ArtistInput = z.input<typeof ArtistInputSchema>
/** The shape after Zod has applied defaults and coerced. Used internally for the row. */
export type ArtistInputParsed = z.output<typeof ArtistInputSchema>

export async function getAllArtists(): Promise<Artist[]> {
  return db.select().from(artists).orderBy(asc(artists.displayName))
}

export async function getActiveArtists(): Promise<Artist[]> {
  return db
    .select()
    .from(artists)
    .where(eq(artists.status, 'active'))
    .orderBy(asc(artists.displayName))
}

export async function getArtistBySlug(slug: string): Promise<Artist | undefined> {
  const rows = await db.select().from(artists).where(eq(artists.slug, slug)).limit(1)
  return rows[0]
}

export async function getArtistByCategoryId(squareCategoryId: string): Promise<Artist | undefined> {
  const rows = await db
    .select()
    .from(artists)
    .where(eq(artists.squareCategoryId, squareCategoryId))
    .limit(1)
  return rows[0]
}

export async function getArtistById(id: string): Promise<Artist | undefined> {
  const rows = await db.select().from(artists).where(eq(artists.id, id)).limit(1)
  return rows[0]
}

export async function createArtist(input: ArtistInput): Promise<Artist> {
  const parsed = ArtistInputSchema.parse(input)
  const [row] = await db
    .insert(artists)
    .values(parsed satisfies NewArtist)
    .returning()
  return row
}

export async function updateArtist(id: string, input: Partial<ArtistInput>): Promise<Artist> {
  const parsed = ArtistInputSchema.partial().parse(input)
  const [row] = await db
    .update(artists)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(artists.id, id))
    .returning()
  if (!row) throw new Error(`artist ${id} not found`)
  return row
}

export async function setArtistStatus(id: string, status: 'active' | 'inactive'): Promise<Artist> {
  const [row] = await db
    .update(artists)
    .set({ status, updatedAt: new Date() })
    .where(eq(artists.id, id))
    .returning()
  if (!row) throw new Error(`artist ${id} not found`)
  return row
}
