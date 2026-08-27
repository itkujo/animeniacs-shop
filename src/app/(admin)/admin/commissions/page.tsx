import { buildReport } from '@/lib/commissions/report'
import {
  getCommissionEarningRows,
  getLastCommissionSyncAt
} from '@/lib/db/queries/commissions'
import { SyncButton } from './_components/SyncButton'

// Reads the DB per-request and runs an admin-only Square recompute action.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Commissions — Animeniacs' }

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function CommissionsPage(): Promise<JSX.Element> {
  const [rows, lastSync] = await Promise.all([
    getCommissionEarningRows(),
    getLastCommissionSyncAt()
  ])
  const report = buildReport(rows)

  const cell: React.CSSProperties = {
    padding: '0.4rem 0.7rem',
    borderBottom: '1px solid #eee',
    textAlign: 'right',
    whiteSpace: 'nowrap'
  }
  const nameCell: React.CSSProperties = { ...cell, textAlign: 'left', fontWeight: 600 }
  const th: React.CSSProperties = { ...cell, borderBottom: '2px solid #ccc', color: '#555' }

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
      <p style={{ margin: 0 }}>
        <a href="/admin" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Admin
        </a>
      </p>
      <h1 style={{ margin: '0.5rem 0 0.25rem' }}>Artist commissions</h1>
      <p style={{ margin: '0 0 1rem', color: '#666', fontSize: '0.9rem' }}>
        20% of net item sales (after discounts), both locations, all history —
        computed from Square. House accounts are shown but not owed; “Unattributed”
        is sales with no artist category (needs catalog cleanup or manual tagging).
        {lastSync
          ? ` Last synced ${lastSync.toLocaleString('en-US', { timeZone: 'America/Chicago' })}.`
          : ' Never synced — run a sync to populate.'}
      </p>

      <div style={{ margin: '0 0 1.25rem' }}>
        <SyncButton />
      </div>

      {report.artists.length === 0 ? (
        <p style={{ color: '#666' }}>No commission data yet. Click “Sync from Square”.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '640px' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Artist</th>
                {report.months.map((m) => (
                  <th key={m} style={th}>
                    {m}
                  </th>
                ))}
                <th style={{ ...th, borderLeft: '2px solid #ccc' }}>Total owed</th>
              </tr>
            </thead>
            <tbody>
              {report.artists.map((a) => {
                const muted = !a.payable || a.artistName === 'Unattributed'
                return (
                  <tr key={a.artistName} style={muted ? { color: '#999' } : undefined}>
                    <td style={nameCell}>
                      {a.artistName}
                      {!a.payable && a.artistName !== 'Unattributed' && (
                        <span style={{ fontWeight: 400, fontSize: '0.75rem' }}> (house)</span>
                      )}
                    </td>
                    {report.months.map((m) => (
                      <td key={m} style={cell}>
                        {a.byMonth[m] ? money(a.byMonth[m]) : '—'}
                      </td>
                    ))}
                    <td style={{ ...cell, borderLeft: '2px solid #ccc', fontWeight: 700 }}>
                      {money(a.totalCents)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...nameCell, borderTop: '2px solid #ccc' }}>All (grand total)</td>
                {report.months.map((m) => (
                  <td key={m} style={{ ...cell, borderTop: '2px solid #ccc', fontWeight: 700 }}>
                    {money(report.columnTotals[m] ?? 0)}
                  </td>
                ))}
                <td
                  style={{
                    ...cell,
                    borderTop: '2px solid #ccc',
                    borderLeft: '2px solid #ccc',
                    fontWeight: 800
                  }}
                >
                  {money(report.grandTotalCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
        <strong>Payable total owed</strong> (excludes house + unattributed):{' '}
        <strong>{money(report.payableTotalCents)}</strong>
      </p>
      <p style={{ marginTop: '0.5rem', color: '#999', fontSize: '0.8rem' }}>
        Figures are pre-refund (refund clawback is a tracked follow-up). Payout
        tracking (record payments, balance owed/advanced) is the next phase.
      </p>
    </div>
  )
}
