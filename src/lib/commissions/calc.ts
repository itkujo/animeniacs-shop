/**
 * Pure commission math — no I/O, fully unit-testable. The sweep (Square reads,
 * catalog resolution) lives elsewhere and feeds these helpers. Money is integer
 * cents throughout. See docs/superpowers/specs/2026-08-06-artist-commissions-payouts.
 */

export type CommissionItemType = 'acrylic' | 'prints' | 'other'

/**
 * Map a Square line item's variation name to a commission item type. Uses
 * substring matching (variation names in the wild vary: "Acrylic Wall Art",
 * "Vinyl Decal Prints", "MariosDal Prints", "Bunny print", …) so it's robust to
 * the per-artist generic listings rung up at shows, not just the two canonical
 * media names in shipping/classify.ts.
 */
export function commissionItemType(variationName: string | null | undefined): CommissionItemType {
  const n = (variationName ?? '').toLowerCase()
  if (n.includes('acrylic')) return 'acrylic'
  if (n.includes('decal') || n.includes('print')) return 'prints'
  return 'other'
}

export interface LineMoney {
  /** gross_sales_money = unit price × qty, before discounts. */
  grossCents: number
  /** total_discount_money allocated to the line (includes order-level discounts). */
  discountCents: number
  /** refunded portion allocated to the line (0 when none). */
  refundCents?: number
}

/**
 * Commission base for a line = item price after its allocated share of the
 * order discount AND any refund, floored at 0 (never negative). Tax/shipping/
 * fees are excluded because Square's gross_sales_money is item-price only.
 */
export function lineNetCents(m: LineMoney): number {
  return Math.max(0, m.grossCents - m.discountCents - (m.refundCents ?? 0))
}

/** Commission = net × rate, rounded to the nearest cent. `rate` is a fraction (0.2 = 20%). */
export function commissionCents(netCents: number, rate: number): number {
  return Math.round(netCents * rate)
}

/**
 * Calendar `YYYY-MM` for an ISO timestamp in the given IANA zone (shop default
 * America/Chicago). Uses Intl so DST is handled; deterministic (no clock read).
 */
export function yearMonthInZone(iso: string, timeZone = 'America/Chicago'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date(iso))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}
