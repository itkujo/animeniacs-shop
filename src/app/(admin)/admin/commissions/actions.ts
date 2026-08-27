'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { runCommissionSync } from '@/lib/commissions/sync'
import { recordPayout } from '@/lib/db/queries/commissions'
import { revalidatePath } from 'next/cache'

export interface SyncState {
  ok?: string
  error?: string
}

/**
 * Recompute the commission cache from Square. Defense-in-depth admin re-check
 * (the (admin) layout already gates the page). Best-effort error surfacing so a
 * Square hiccup shows a message instead of a crash.
 */
export async function syncCommissionsAction(_prev: SyncState): Promise<SyncState> {
  const { roles } = await getCurrentUser()
  if (!roles.includes('admin')) return { error: 'Not authorized.' }

  try {
    const r = await runCommissionSync()
    revalidatePath('/admin/commissions')
    return {
      ok: `Synced ${r.earningRows} rows across ${r.artistsSeen} artists (${r.unattributedRows} unattributed) at ${r.syncedAt.toLocaleString('en-US', { timeZone: 'America/Chicago' })}.`
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sync failed.' }
  }
}

export interface PayoutState {
  ok?: string
  error?: string
}

/** Record a payout to an artist. Amount is in dollars from the form. Admin re-checked. */
export async function recordPayoutAction(_prev: PayoutState, form: FormData): Promise<PayoutState> {
  const { roles, userId } = await getCurrentUser()
  if (!roles.includes('admin')) return { error: 'Not authorized.' }

  const artistId = String(form.get('artistId') ?? '').trim()
  const amount = Number(String(form.get('amount') ?? '').trim())
  const dateStr = String(form.get('paidAt') ?? '').trim()
  const method = String(form.get('method') ?? '').trim() || null
  const note = String(form.get('note') ?? '').trim() || null

  if (!artistId) return { error: 'Pick an artist.' }
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter a positive dollar amount.' }
  const paidAt = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date()
  if (Number.isNaN(paidAt.getTime())) return { error: 'Invalid date.' }

  try {
    await recordPayout({
      artistId,
      amountCents: Math.round(amount * 100),
      paidAt,
      method,
      note,
      createdBy: userId
    })
    revalidatePath('/admin/commissions')
    return { ok: `Recorded $${amount.toFixed(2)} payout.` }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not record payout.' }
  }
}
