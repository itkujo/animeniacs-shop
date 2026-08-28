import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getArtistByAccountEmail } from '@/lib/db/queries/commissions'
import { redirect } from 'next/navigation'
import { AccountNav } from './account/_components/AccountNav'

// Account routes read the auth session + DB at request time. Forcing dynamic
// stops Next.js from attempting build-time prerender (which would try to reach
// the Postgres host in an environment that has neither). Mirrors the
// (admin) group and the force-dynamic root layout.
export const dynamic = 'force-dynamic'

/**
 * Auth gate for every page under the (account) route group. Any authenticated
 * user may enter (no role requirement — this is the customer-facing storefront
 * area, not admin). Unauthenticated requests are sent to /sign-in.
 *
 * Storefront conventions: Tailwind, NOT the admin inline-style idiom.
 */
export default async function AccountLayout({
  children
}: {
  children: React.ReactNode
}): Promise<JSX.Element> {
  const { isAuthenticated, email } = await getCurrentUser()
  if (!isAuthenticated) {
    redirect('/sign-in')
  }
  const isArtist = email ? (await getArtistByAccountEmail(email)) !== null : false

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <AccountNav isArtist={isArtist} />
      {children}
    </div>
  )
}
