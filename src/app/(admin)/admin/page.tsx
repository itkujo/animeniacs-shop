import { getOrderDashboardStats } from '@/lib/db/queries/orders'
import type { Route } from 'next'
import Link from 'next/link'

export const metadata = {
  title: 'Admin — Animeniacs'
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Admin landing page. The (admin) route group had feature pages
 * (artists, ip-nicknames, sms-recipients) but no index linking them
 * together, so operators had to know each URL by heart. This hub lists
 * every admin section.
 *
 * Styling note: unlike the older admin feature pages, this page sets
 * explicit `color` and `background` so it stays legible under a mobile
 * browser's dark color-scheme preference (those pages inherit dark text
 * on a dark default and appear blank). Phase 7.5/B.8 follow-up.
 */

interface AdminSection {
  href: Route
  title: string
  description: string
}

const SECTIONS: AdminSection[] = [
  {
    href: '/admin/orders' as Route,
    title: 'Orders',
    description: 'View orders, issue refunds, and advance fulfillment.'
  },
  {
    href: '/admin/artists' as Route,
    title: 'Artists',
    description: 'Manage partner artists shown across the storefront.'
  },
  {
    href: '/admin/commissions' as Route,
    title: 'Commissions',
    description: 'Per-artist commission owed by month (both locations) — 20% of net sales.'
  },
  {
    href: '/admin/ip-nicknames' as Route,
    title: 'IP nicknames',
    description: 'Map Square categories to public-facing IP names and slugs.'
  },
  {
    href: '/admin/sms-recipients' as Route,
    title: 'SMS recipients',
    description: 'Phone numbers that receive transactional order SMS.'
  },
  {
    href: '/admin/reviews' as Route,
    title: 'Reviews',
    description: 'Moderate held product reviews — publish or delete.'
  },
  {
    href: '/admin/shipping' as Route,
    title: 'Shipping',
    description: 'Live carrier rates: origin, flat fees, markup, and per-box packaging fees.'
  },
  {
    href: '/admin/settings' as Route,
    title: 'Settings',
    description: 'Storefront promo bar and other site-wide settings.'
  }
]

export default async function AdminIndexPage(): Promise<JSX.Element> {
  const stats = await getOrderDashboardStats()

  return (
    <div
      style={{
        padding: '1.5rem',
        fontFamily: 'system-ui, sans-serif',
        color: '#111',
        background: '#fff',
        minHeight: '100vh'
      }}
    >
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <p style={{ color: '#555', marginTop: '0.5rem' }}>
          Internal tools for managing the Animeniacs storefront.
        </p>
      </header>

      <section
        aria-label="Order dashboard"
        style={{
          display: 'grid',
          gap: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))',
          marginBottom: '1.5rem'
        }}
      >
        <Stat label="Orders today" value={String(stats.ordersToday)} />
        <Stat label="Orders (7d)" value={String(stats.orders7d)} />
        <Stat label="Orders (30d)" value={String(stats.orders30d)} />
        <Stat label="Revenue (30d)" value={formatCents(stats.revenue30dCents)} />
        <Stat label="Refunded (total)" value={formatCents(stats.refundedTotalCents)} />
        <Stat label="Needs fulfillment" value={String(stats.needsFulfillment)} />
      </section>

      <nav aria-label="Admin sections">
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))'
          }}
        >
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                style={{
                  display: 'block',
                  padding: '1rem',
                  border: '1px solid #ddd',
                  borderRadius: '0.5rem',
                  textDecoration: 'none',
                  color: '#111',
                  background: '#fafafa'
                }}
              >
                <span style={{ display: 'block', fontWeight: 600, fontSize: '1.05rem' }}>
                  {section.title}
                </span>
                <span style={{ display: 'block', marginTop: '0.35rem', color: '#555' }}>
                  {section.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Single read-only metric tile in the dashboard strip. */
function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        padding: '0.75rem 1rem',
        border: '1px solid #ddd',
        borderRadius: '0.5rem',
        background: '#fafafa'
      }}
    >
      <span style={{ display: 'block', color: '#555', fontSize: '0.85rem' }}>{label}</span>
      <span style={{ display: 'block', fontWeight: 700, fontSize: '1.25rem' }}>{value}</span>
    </div>
  )
}
