'use client'

import { type PayoutState, recordPayoutAction } from '../actions'
import { useFormState, useFormStatus } from 'react-dom'

export interface PayoutFormArtist {
  id: string
  name: string
}

const input: React.CSSProperties = {
  padding: '0.4rem 0.5rem',
  border: '1px solid #ccc',
  borderRadius: '0.3rem',
  fontSize: '0.85rem'
}

function Submit(): JSX.Element {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: '0.45rem 1rem',
        fontWeight: 600,
        background: pending ? '#999' : '#111',
        color: '#fff',
        border: 'none',
        borderRadius: '0.3rem',
        cursor: pending ? 'wait' : 'pointer'
      }}
    >
      {pending ? 'Recording…' : 'Record payout'}
    </button>
  )
}

/** Record-a-payout form: artist, amount ($), date, method, note. */
export function PayoutForm({ artists }: { artists: PayoutFormArtist[] }): JSX.Element {
  const [state, action] = useFormState<PayoutState, FormData>(recordPayoutAction, {})
  return (
    <form
      action={action}
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}
    >
      <select name="artistId" required style={input} defaultValue="">
        <option value="" disabled>
          Select artist…
        </option>
        {artists.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount $" required style={{ ...input, width: '110px' }} />
      <input name="paidAt" type="date" style={input} aria-label="Paid date" />
      <input name="method" type="text" placeholder="Method (cash, Venmo…)" style={{ ...input, width: '160px' }} />
      <input name="note" type="text" placeholder="Note (optional)" style={{ ...input, width: '200px' }} />
      <Submit />
      {state.ok && <span style={{ color: '#15803d', fontSize: '0.85rem' }}>{state.ok}</span>}
      {state.error && <span style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{state.error}</span>}
    </form>
  )
}
