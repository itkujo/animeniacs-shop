import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core'

export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by')
})

export type SiteSetting = typeof siteSettings.$inferSelect
export type NewSiteSetting = typeof siteSettings.$inferInsert

export const eventLogos = pgTable(
  'event_logos',
  {
    hashtag: text('hashtag').primaryKey(), // e.g. "anime-expo" (no leading #)
    imageUrl: text('image_url').notNull(),
    // TS-side enum is a type hint only; Drizzle does NOT emit CHECK from it.
    // We add an explicit check() below to match spec §11 SQL.
    source: text('source', { enum: ['scraped', 'manual_upload', 'manual_override'] }).notNull(),
    sourceEventUrl: text('source_event_url'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by')
  },
  (table) => ({
    sourceValid: check(
      'event_logos_source_valid',
      sql`${table.source} IN ('scraped', 'manual_upload', 'manual_override')`
    )
  })
)

export type EventLogo = typeof eventLogos.$inferSelect
export type NewEventLogo = typeof eventLogos.$inferInsert

export const smsRecipients = pgTable('sms_recipients', {
  id: serial('id').primaryKey(),
  phone: text('phone').notNull().unique(), // E.164 format
  label: text('label'), // "Owner", "Manager", etc.
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export type SmsRecipient = typeof smsRecipients.$inferSelect
export type NewSmsRecipient = typeof smsRecipients.$inferInsert

export const wishlists = pgTable(
  'wishlists',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }), // Phase 15: FK → user.id
    productId: text('product_id').notNull(), // Square catalog item ID
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.productId] })
  })
)

export type WishlistEntry = typeof wishlists.$inferSelect
export type NewWishlistEntry = typeof wishlists.$inferInsert

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: text('product_id').notNull(), // Square catalog item ID
    // Phase 15: FK → user.id (set null on delete); nullable for guest/imported reviews
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    orderId: text('order_id'), // Square order ID; used to verify purchase
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body').notNull(),
    authorName: text('author_name'), // denormalized reviewer display name captured at submit
    photoUrls: text('photo_urls').array().notNull().default(sql`'{}'::text[]`),
    isPublished: boolean('is_published').notNull().default(false),
    isVerifiedPurchase: boolean('is_verified_purchase').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    ratingRange: check('reviews_rating_range', sql`${table.rating} BETWEEN 1 AND 5`),
    uniqueUserProduct: unique('reviews_user_product_unique').on(table.userId, table.productId)
  })
)

export type Review = typeof reviews.$inferSelect
export type NewReview = typeof reviews.$inferInsert

export const abandonedCarts = pgTable(
  'abandoned_carts',
  {
    cartId: text('cart_id').primaryKey(), // UUID we generate at /api/checkout
    squareOrderId: text('square_order_id'), // populated once Square assigns an order ID
    buyerEmail: text('buyer_email'), // nullable; only known if buyer typed it
    // Phase 11 attribution bridge: the webhook is server-to-server (no auth
    // session), so it reads the buyer's identity from this row to attribute orders.
    // Phase 15: FK → user.id (set null on delete); null for guests
    buyerUserId: text('buyer_user_id').references(() => user.id, { onDelete: 'set null' }),
    squareCustomerId: text('square_customer_id'), // Square customer attributed at checkout
    cartSnapshot: jsonb('cart_snapshot').notNull(), // line items for the reminder email
    // TS enum is a type hint only; Drizzle does not emit CHECK from it.
    status: text('status', {
      enum: ['pending', 'in_checkout', 'completed', 'abandoned']
    })
      .notNull()
      .default('pending'),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusValid: check(
      'abandoned_carts_status_valid',
      sql`${table.status} IN ('pending', 'in_checkout', 'completed', 'abandoned')`
    )
  })
)

export type AbandonedCart = typeof abandonedCarts.$inferSelect
export type NewAbandonedCart = typeof abandonedCarts.$inferInsert

/**
 * Shippo dynamic-shipping snapshot persisted on a recorded order: the address we
 * collected on-site + the carrier rate the buyer picked. The fulfillment team
 * buys that exact label (by `shipmentId`/`rateId`) in Shippo later. `fallbackUsed`
 * means the flat fallback fee was charged (live rate missing/expired/outage).
 */
export interface OrderShippingAddress {
  firstName: string
  lastName: string
  line1: string
  line2?: string
  city: string
  state?: string
  zip: string
  country: string
  phone?: string
  email?: string
}
export interface OrderShippingSelection {
  rateId: string
  shipmentId: string
  carrier: string
  service: string
  amountCents: number
}
export interface OrderShipping {
  address: OrderShippingAddress
  selection: OrderShippingSelection | null
  fallbackUsed: boolean
}

// Phase 11: durable read model of completed orders. Square stays the system of
// record for money; this table powers the customer-facing /account order history.
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    squareOrderId: text('square_order_id').notNull().unique(), // idempotency key for upsert
    squarePaymentId: text('square_payment_id'),
    // Phase 15: FK → user.id (set null on delete); null for guest orders
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    buyerEmail: text('buyer_email'), // display/fallback
    squareCustomerId: text('square_customer_id'), // mirror of the Square order customer
    // TS enum is a type hint only; explicit CHECK below enforces at DB level.
    status: text('status', { enum: ['completed', 'refunded', 'partially_refunded'] })
      .notNull()
      .default('completed'),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    lineItems: jsonb('line_items').notNull(), // [{ name, quantity, unitPriceCents, totalCents, catalogObjectId?, variationName? }]
    // Phase 13: raw Square fulfillment state (PROPOSED|RESERVED|PREPARED|COMPLETED|
    // CANCELED|FAILED); null when the order has no fulfillment.
    fulfillmentState: text('fulfillment_state'),
    // Phase 13: cumulative refunded amount in cents (server-computed from the
    // authoritative Square order on refund webhooks). Powers "Refunded $X of $Y".
    refundedCents: integer('refunded_cents').notNull().default(0),
    placedAt: timestamp('placed_at', { withTimezone: true }),
    raw: jsonb('raw'), // full Square order snapshot (audit/debug)
    // Shippo dynamic shipping: captured ship-to + the chosen carrier rate. Null
    // for orders placed before this feature / via other paths.
    shipping: jsonb('shipping').$type<OrderShipping>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusValid: check(
      'orders_status_valid',
      sql`${table.status} IN ('completed', 'refunded', 'partially_refunded')`
    ),
    userIdIdx: index('orders_user_id_idx').on(table.userId)
  })
)

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert

export const productCache = pgTable('product_cache', {
  catalogItemId: text('catalog_item_id').primaryKey(), // Square catalog item ID
  data: jsonb('data').notNull(), // denormalized: name, price, image URLs, custom attrs
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type ProductCacheEntry = typeof productCache.$inferSelect
export type NewProductCacheEntry = typeof productCache.$inferInsert

export const orderLog = pgTable(
  'order_log',
  {
    id: serial('id').primaryKey(),
    squareOrderId: text('square_order_id').notNull(),
    eventType: text('event_type').notNull(), // e.g. "order.created", "payment.created"
    /** Square event_id from the webhook payload. Used for idempotency
     *  in the webhook handler — duplicate events get logged but skip
     *  notification fanout. Nullable so backfilled rows (none yet) and
     *  any future non-webhook log writes don't violate. */
    eventId: text('event_id'),
    payload: jsonb('payload').notNull(), // raw webhook body
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    eventIdIdx: index('order_log_event_id_idx').on(table.eventId)
  })
)

export type OrderLogEntry = typeof orderLog.$inferSelect
export type NewOrderLogEntry = typeof orderLog.$inferInsert

export const artists = pgTable(
  'artists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    squareCategoryId: text('square_category_id').notNull(),
    // TS-side enum is a type hint only; Drizzle does NOT emit CHECK from it.
    // Explicit check below enforces at DB level (matches Phase 2 convention).
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    instagram: text('instagram'),
    twitter: text('twitter'),
    facebook: text('facebook'),
    youtube: text('youtube'),
    tiktok: text('tiktok'),
    website: text('website'),
    commissionRate: numeric('commission_rate', { precision: 5, scale: 4 })
      .notNull()
      .default('0.2000'),
    // House/non-payable accounts (e.g. "Animeniacs Studios") stay `false`: their
    // commission is still COMPUTED and shown, but excluded from amounts owed.
    payable: boolean('payable').notNull().default(true),
    paymentMethod: text('payment_method'),
    paymentEmail: text('payment_email'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusValid: check('artists_status_valid', sql`${table.status} IN ('active', 'inactive')`)
  })
)

export type Artist = typeof artists.$inferSelect
export type NewArtist = typeof artists.$inferInsert

// ---------------------------------------------------------------------------
// Artist commissions & payouts (design: 2026-08-06-artist-commissions-payouts).
// `commission_earnings` is a MATERIALIZED cache recomputed from production Square
// (both locations, all history) by the sync job — safe to wipe+rebuild per period.
// `commission_overrides` and `artist_payouts` are DURABLE operator inputs the
// sync must NEVER overwrite. Money is integer cents. `item_type`: acrylic|prints|
// other. `location`: online|mobile. A null `artist_id` = unattributed/custom sale.
// ---------------------------------------------------------------------------
export const commissionEarnings = pgTable(
  'commission_earnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artistId: uuid('artist_id').references(() => artists.id, { onDelete: 'set null' }),
    yearMonth: text('year_month').notNull(), // 'YYYY-MM' in America/Chicago
    itemType: text('item_type').notNull(),
    location: text('location').notNull(),
    grossCents: integer('gross_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    refundCents: integer('refund_cents').notNull().default(0),
    netCents: integer('net_cents').notNull().default(0),
    commissionCents: integer('commission_cents').notNull().default(0),
    orderCount: integer('order_count').notNull().default(0),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    itemTypeValid: check(
      'commission_earnings_item_type_valid',
      sql`${table.itemType} IN ('acrylic', 'prints', 'other')`
    ),
    locationValid: check(
      'commission_earnings_location_valid',
      sql`${table.location} IN ('online', 'mobile')`
    ),
    artistMonthIdx: index('commission_earnings_artist_month_idx').on(table.artistId, table.yearMonth),
    monthIdx: index('commission_earnings_month_idx').on(table.yearMonth)
  })
)

export const commissionOverrides = pgTable(
  'commission_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(),
    itemType: text('item_type').notNull(),
    // Replaces the computed commission for this artist/month/type when present.
    overrideCommissionCents: integer('override_commission_cents').notNull(),
    note: text('note'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    itemTypeValid: check(
      'commission_overrides_item_type_valid',
      sql`${table.itemType} IN ('acrylic', 'prints', 'other')`
    ),
    uniqueCell: unique('commission_overrides_cell_unique').on(
      table.artistId,
      table.yearMonth,
      table.itemType
    )
  })
)

export const artistPayouts = pgTable(
  'artist_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(), // > 0; advances tracked via balance going negative
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    method: text('method'),
    note: text('note'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    artistIdx: index('artist_payouts_artist_idx').on(table.artistId)
  })
)

export type CommissionEarning = typeof commissionEarnings.$inferSelect
export type NewCommissionEarning = typeof commissionEarnings.$inferInsert
export type CommissionOverride = typeof commissionOverrides.$inferSelect
export type ArtistPayout = typeof artistPayouts.$inferSelect
export type NewArtistPayout = typeof artistPayouts.$inferInsert

// ---------------------------------------------------------------------------
// Phase 15: better-auth (email + password). These four tables are the canonical
// better-auth 1.x schema (`user`/`session`/`account`/`verification`). Drizzle
// property names are camelCase to match better-auth's field names; the adapter
// maps them to the snake_case DB columns. `user` carries two additionalFields:
// `squareCustomerId` (Square mapping, was the dropped `customer_link`) and
// `role` (admin gating). DB-managed by better-auth — do not write directly
// except via the auth API or the `grant-admin` script.
// ---------------------------------------------------------------------------
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // additionalFields (better-auth `user.additionalFields`):
  squareCustomerId: text('square_customer_id'),
  role: text('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type Session = typeof session.$inferSelect
export type NewSession = typeof session.$inferInsert

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type Account = typeof account.$inferSelect
export type NewAccount = typeof account.$inferInsert

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type Verification = typeof verification.$inferSelect
export type NewVerification = typeof verification.$inferInsert

/** The shape stored in `saved_addresses.address` (jsonb). */
export interface SavedAddressDetails {
  firstName: string
  lastName: string
  line1: string
  line2?: string
  city: string
  state: string
  zip: string
  phone?: string
}

// Phase 15: multiple labeled shipping addresses per user (replaces Phase 11's
// single address-on-the-Square-customer). One default per user is enforced in
// the query layer (saveAddress unsets the others in a transaction).
export const savedAddresses = pgTable(
  'saved_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    address: jsonb('address').$type<SavedAddressDetails>().notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('saved_addresses_user_id_idx').on(table.userId)
  })
)

export type SavedAddress = typeof savedAddresses.$inferSelect
export type NewSavedAddress = typeof savedAddresses.$inferInsert

export const ipNicknames = pgTable('ip_nicknames', {
  id: uuid('id').primaryKey().defaultRandom(),
  squareCategoryId: text('square_category_id').notNull().unique(),
  slug: text('slug').notNull().unique(),
  nickname: text('nickname').notNull(),
  description: text('description'),
  // Nullable in Phase 5; no UI populates this column. Future phases add upload UI.
  coverImageUrl: text('cover_image_url'),
  isPublic: boolean('is_public').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type IpNickname = typeof ipNicknames.$inferSelect
export type NewIpNickname = typeof ipNicknames.$inferInsert
