'use client'

import { type SyncState, syncCommissionsAction } from '../actions'
import { useFormState, useFormStatus } from 'react-dom'

function SubmitButton(): JSX.Element {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: '0.5rem 1rem',
        fontWeight: 600,
        cursor: pending ? 'wait' : 'pointer',
        background: pending ? '#999' : '#111',
        color: '#fff',
        border: 'none',
        borderRadius: '0.4rem'
      }}
    >
      {pending ? 'Syncing from Square…' : 'Sync from Square'}
    </button>
  )
}

/** Runs the commission recompute and shows the result inline. */
export function SyncButton(): JSX.Element {
  const [state, formAction] = useFormState<SyncState, FormData>(
    (prev) => syncCommissionsAction(prev),
    {}
  )
  return (
    <form action={formAction} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <SubmitButton />
      {state.ok && <span style={{ color: '#15803d', fontSize: '0.85rem' }}>{state.ok}</span>}
      {state.error && <span style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{state.error}</span>}
    </form>
  )
}
