import { Logo } from './Logo'
import { homeHref, pageHref } from '../lib/links'

/**
 * Shared footer. Lives inside the last story chapter on the home page, and at the
 * bottom of every standalone page.
 *
 * `home` exists because the section links can't be written one way for both:
 * on the scroll story, `#features` is a bare hash Lenis smooth-scrolls to; on a
 * standalone page there is no such section, so a bare hash is a dead link and it
 * has to navigate to the home page's anchor instead. Defaulting to `true` keeps
 * the existing story call site (C08BoardingPass) unchanged.
 */
export function Footer({ home = true }: { home?: boolean }) {
  return (
    <footer className="bg-navy-900 px-5 py-12 text-white/55">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 border-t border-white/10 pt-10 sm:flex-row">
        {home ? (
          <Logo variant="dark" className="text-white" />
        ) : (
          <a href={homeHref()} className="transition-opacity hover:opacity-80" aria-label="Email Pilots — home">
            <Logo variant="dark" className="text-white" />
          </a>
        )}
        <nav className="flex flex-wrap items-center justify-center gap-6 text-sm">
          <a href={home ? '#features' : homeHref('#features')} className="hover:text-white">Features</a>
          <a href={home ? '#pricing' : homeHref('#pricing')} className="hover:text-white">Pricing</a>
          <a href={pageHref('install')} className="hover:text-white">Install help</a>
          <a href={pageHref('app-passwords')} className="hover:text-white">Gmail setup</a>
          <a href={pageHref('privacy')} className="hover:text-white">Privacy</a>
          <a href={pageHref('terms')} className="hover:text-white">Terms</a>
        </nav>
        <div className="text-xs">© {new Date().getFullYear()} Email Pilots. Sent from your machine, not ours.</div>
      </div>
    </footer>
  )
}
