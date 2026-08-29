import { useState } from 'react'
import { useLenis } from 'lenis/react'
import { NAV, DOWNLOAD_URL } from '../config'
import { cn } from '../lib/cn'
import { Logo } from './Logo'

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  useLenis((lenis: any) => setScrolled((lenis?.scroll ?? window.scrollY) > 80))

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled ? 'border-b border-paper-line bg-white/85 backdrop-blur-xl' : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center" aria-label="Email Pilots — home">
          <Logo className={cn('transition-colors', scrolled ? 'text-ink' : 'text-white')} />
        </a>
        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={cn('text-sm font-semibold transition-colors', scrolled ? 'text-slate-ink hover:text-blue' : 'text-white/75 hover:text-white')}>
              {n.label}
            </a>
          ))}
        </nav>
        <a
          href={DOWNLOAD_URL}
          data-goatcounter-click="download-header"
          className="inline-flex h-10 items-center rounded-lg bg-blue px-4 text-sm font-bold text-white shadow-glow transition-colors hover:bg-blue-600"
        >
          Download — <span className="ml-1 hidden sm:inline">first month free</span><span className="ml-1 sm:hidden">free</span>
        </a>
      </div>
    </header>
  )
}
