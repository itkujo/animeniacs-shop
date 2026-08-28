'use client'

import { SignOutButton } from '@/components/auth/SignOutButton'
import { usePathname } from 'next/navigation'

const BASE_TABS = [
  { href: '/account', label: 'Account' },
  { href: '/account/orders', label: 'Order history' },
  { href: '/account/wishlist', label: 'Wishlist' }
]

/**
 * Account tab bar. Themed to the Street Gallery look — purple hairline rule,
 * neon underline on the active tab. Client component so it can highlight the
 * current section via the pathname (`aria-current="page"`). The "Earnings" tab
 * only appears for users linked to an artist (server passes `isArtist`).
 */
export function AccountNav({ isArtist = false }: { isArtist?: boolean }): JSX.Element {
  const pathname = usePathname()
  const TABS = isArtist
    ? [...BASE_TABS, { href: '/account/earnings', label: 'Earnings' }]
    : BASE_TABS

  function isActive(href: string): boolean {
    if (href === '/account') return pathname === '/account'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav aria-label="Account" className="mb-8 border-b border-line">
      <ul className="flex flex-wrap items-center gap-6 text-sm font-medium">
        {TABS.map((tab) => {
          const active = isActive(tab.href)
          return (
            <li key={tab.href}>
              <a
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'relative -mb-px inline-block border-b-2 border-neon pb-3 text-bone neon-text hover:no-underline'
                    : 'relative -mb-px inline-block border-b-2 border-transparent pb-3 text-muted transition-colors hover:text-bone hover:no-underline'
                }
              >
                {tab.label}
              </a>
            </li>
          )
        })}
        <li className="ml-auto pb-3">
          <SignOutButton className="text-sm text-muted transition-colors hover:text-neon disabled:opacity-60" />
        </li>
      </ul>
    </nav>
  )
}
