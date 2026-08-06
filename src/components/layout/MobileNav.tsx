'use client'

import { ComingSoonNavItem } from '@/components/layout/ComingSoonNavItem'
import type { NavItem } from '@/components/layout/Header'
import * as Dialog from '@radix-ui/react-dialog'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'

/**
 * Mobile-only nav. The desktop nav links are `hidden md:block`, so without this
 * a phone visitor has no way to navigate. A hamburger opens an accessible Radix
 * dialog drawer (focus trap + escape + scroll lock) with the same links.
 */
export function MobileNav({ items }: { items: NavItem[] }): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="-mr-1 inline-flex h-10 w-10 items-center justify-center text-bone transition-colors hover:text-neon md:hidden"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-72 max-w-[82vw] flex-col border-l border-line-strong bg-ink-2 p-6 shadow-[0_0_60px_rgba(139,61,255,0.4)] focus:outline-none">
          <div className="flex items-center justify-between">
            <Dialog.Title className="eyebrow">Menu</Dialog.Title>
            <Dialog.Close
              aria-label="Close menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded text-muted transition-colors hover:text-neon"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Dialog.Close>
          </div>

          <nav aria-label="Mobile" className="mt-6 flex flex-col">
            {items.map((item) =>
              item.comingSoon ? (
                <ComingSoonNavItem
                  key={item.href}
                  label={item.label}
                  wrapperClassName="relative block"
                  className="w-full border-b border-line py-3 text-left font-display text-3xl text-bone transition-colors hover:text-neon"
                />
              ) : item.litBox ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="lit-box-glow border-b border-line py-3 font-display text-3xl uppercase tracking-wide"
                >
                  {item.label}
                </Link>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-line py-3 font-display text-3xl text-bone transition-colors hover:text-neon hover:no-underline"
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>

          <Link
            href={'/shop' as Route}
            onClick={() => setOpen(false)}
            className="btn-neon mt-8 justify-center"
          >
            Shop the drop
            <span aria-hidden="true">→</span>
          </Link>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
