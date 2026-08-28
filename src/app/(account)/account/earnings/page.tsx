import { buildArtistStatement } from '@/lib/commissions/report'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  getArtistByAccountEmail,
  getArtistEarnings,
  getLastCommissionSyncAt,
  getPayoutsForArtist
} from '@/lib/db/queries/commissions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your earnings | Animeniacs' }

function money(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function EarningsPage(): Promise<JSX.Element> {
  const { email } = await getCurrentUser()
  const artist = email ? await getArtistByAccountEmail(email) : null

  if (!artist) {
    return (
      <section>
        <h1 className="font-display text-4xl text-bone">Your earnings</h1>
        <p className="mt-4 max-w-prose text-muted">
          This account isn’t linked to an artist profile yet. If you’re one of our
          artists, let us know the email you signed up with and we’ll connect your
          earnings here.
        </p>
      </section>
    )
  }

  const [earnings, payouts, lastSync] = await Promise.all([
    getArtistEarnings(artist.id),
    getPayoutsForArtist(artist.id),
    getLastCommissionSyncAt()
  ])
  const s = buildArtistStatement(earnings, payouts)

  const balanceLabel =
    s.balanceCents > 0 ? 'Owed to you' : s.balanceCents < 0 ? 'Advanced to you' : 'All settled up'
  const balanceColor =
    s.balanceCents > 0 ? 'text-neon' : s.balanceCents < 0 ? 'text-amber-400' : 'text-bone'

  return (
    <section>
      <p className="eyebrow">Artist earnings</p>
      <h1 className="mt-2 font-display text-4xl text-bone">{artist.displayName}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-wall p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Total made</p>
          <p className="mt-1 font-mono text-2xl text-bone">{money(s.madeCents)}</p>
        </div>
        <div className="rounded-lg border border-line bg-wall p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Total paid</p>
          <p className="mt-1 font-mono text-2xl text-bone">{money(s.paidCents)}</p>
        </div>
        <div className="rounded-lg border border-line bg-wall p-5">
          <p className="text-xs uppercase tracking-wide text-muted">{balanceLabel}</p>
          <p className={`mt-1 font-mono text-2xl ${balanceColor}`}>{money(Math.abs(s.balanceCents))}</p>
        </div>
      </div>

      <h2 className="mt-10 font-display text-2xl text-bone">By month</h2>
      {s.months.length === 0 ? (
        <p className="mt-2 text-muted">No commission recorded yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full max-w-md border-collapse text-sm">
            <tbody>
              {s.months.map((m) => (
                <tr key={m} className="border-b border-line">
                  <td className="py-2 text-muted">{m}</td>
                  <td className="py-2 text-right font-mono text-bone">{money(s.byMonth[m])}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-semibold text-bone">Total</td>
                <td className="py-2 text-right font-mono font-bold text-bone">{money(s.madeCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 font-display text-2xl text-bone">Payments</h2>
      {payouts.length === 0 ? (
        <p className="mt-2 text-muted">No payments recorded yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full max-w-2xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-strong text-left text-muted">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Amount</th>
                <th className="py-2 font-medium">Method</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-2 text-muted">
                    {p.paidAt.toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
                  </td>
                  <td className="py-2 font-mono text-bone">{money(p.amountCents)}</td>
                  <td className="py-2 text-muted">{p.method ?? '—'}</td>
                  <td className="py-2 text-muted">{p.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-xs text-faint">
        Commission is your agreed rate of net sales (after discounts), updated when we sync from
        Square{lastSync
          ? ` (last updated ${lastSync.toLocaleDateString('en-US', { timeZone: 'America/Chicago' })})`
          : ''}
        . Figures are pre-refund. Questions? Reach out any time.
      </p>
    </section>
  )
}
