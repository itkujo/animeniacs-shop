'use client'

import { CartButton } from '@/components/cart/CartButton'
import { ComingSoonNavItem } from '@/components/layout/ComingSoonNavItem'
import { Logo } from '@/components/layout/Logo'
import { MobileNav } from '@/components/layout/MobileNav'
import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export interface NavItem {
  href: Route
  label: string
  /** Section not built yet — render a "coming soon" affordance, not a link. */
  comingSoon?: boolean
  /** Signature LIT Box CTA — renders with the purple→green glow animation. */
  litBox?: boolean
}

const NAV: NavItem[] = [
  { href: '/shop' as Route, label: 'Shop' },
  { href: '/artist' as Route, label: 'Artists' },
  { href: '/shop?q=litbox' as Route, label: 'LIT Box', litBox: true },
  { href: '/custom/acrylic' as Route, label: 'Custom Acrylic', comingSoon: true },
  { href: '/custom/stickers' as Route, label: 'Custom Stickers', comingSoon: true },
  { href: '/account' as Route, label: 'Account' }
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** The graffiti mark as the nav wordmark. Sized so it reads (it turns to mush
 * below ~h-14); the duotone Logo recolors via the --logo-* vars in globals.css. */
function Wordmark(): JSX.Element {
  return (
    <Link
      href="/"
      aria-label="Animeniacs home"
      className="block transition-transform hover:scale-[1.03] hover:no-underline"
    >
      <Logo className="h-14 w-auto drop-shadow-[0_0_18px_rgba(139,61,255,0.45)]" />
    </Link>
  )
}

export function Header(): JSX.Element {
  const pathname = usePathname() ?? '/'
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur-md transition-all duration-300 ${
        scrolled
          ? 'border-line-strong bg-ink/95 shadow-[0_10px_30px_-12px_rgba(139,61,255,0.55)]'
          : 'border-line bg-ink/80'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3">
        <Wordmark />
        <nav aria-label="Primary">
          <ul className="flex items-center gap-7 text-sm font-medium">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <li key={item.href} className="hidden md:block">
                  {item.comingSoon ? (
                    <ComingSoonNavItem label={item.label} className="link-neon p-0" />
                  ) : item.litBox ? (
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className="lit-box-glow font-display text-lg uppercase tracking-wide"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`link-neon${active ? ' is-active' : ''}`}
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              )
            })}
            <li className="text-bone">
              <CartButton />
            </li>
            <li className="md:hidden">
              <MobileNav items={NAV} />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
