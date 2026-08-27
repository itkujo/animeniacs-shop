'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { runCommissionSync } from '@/lib/commissions/sync'
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
