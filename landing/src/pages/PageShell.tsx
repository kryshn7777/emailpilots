import type { ReactNode } from 'react'
import { Logo } from '../components/Logo'
import { Footer } from '../components/Footer'
import { homeHref } from '../lib/links'

/**
 * Chrome for the standalone pages (install, app-passwords, privacy, terms).
 *
 * Deliberately NOT the scroll story: no Hud, no Story, no Lenis, no SkyCanvas.
 * These pages are read by someone mid-install with a warning dialog on screen or
 * hunting for a policy clause — they want text, immediately. Importing App would
 * pull three/gsap/lenis for a page that scrolls normally and animates nothing.
 *
 * The prose styling is hand-rolled rather than @tailwindcss/typography: one more
 * dependency for four static pages isn't worth it, and the token palette
 * (--color-ink, --color-slate-ink, --font-display) is already what we want.
 */
export function PageShell({
  title,
  intro,
  children,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-paper-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
          <a href={homeHref()} className="text-ink transition-opacity hover:opacity-70" aria-label="Email Pilots — home">
            <Logo />
          </a>
          <a href={homeHref()} className="text-sm text-slate-mute transition-colors hover:text-ink">
            ← Back to site
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-14">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {intro && <div className="mt-4 text-lg text-slate-ink">{intro}</div>}
        <div className="mt-10 flex flex-col gap-8 text-slate-ink leading-relaxed">{children}</div>
      </main>

      <Footer home={false} />
    </div>
  )
}

/** A titled section. `id` lets a policy clause be linked to directly. */
export function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-bold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  )
}

/** Ordered steps with blueprint-blue numbering. Shared by install + app-passwords. */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue/10 font-display text-sm font-bold text-blue"
          >
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  )
}

/** Bulleted list with the blueprint-blue markers used across the site. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
