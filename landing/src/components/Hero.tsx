import { lazy, Suspense } from 'react'
import { Button } from './ui/Button'
import { HERO, PRICE, CHECKOUT_URL } from '../config'

const FlightScene = lazy(() => import('../three/FlightScene'))

export function Hero() {
  return (
    <section id="top" className="relative min-h-screen overflow-hidden bg-navy text-paper">
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <FlightScene />
        </Suspense>
      </div>

      {/* Left fog so the headline stays legible over the scene. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to right, rgba(10,20,48,0.94) 0%, rgba(10,20,48,0.7) 40%, rgba(10,20,48,0) 72%)' }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 pt-16">
        <div className="max-w-2xl">
          <span className="inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[.18em] text-blue-glow">
            {HERO.kicker}
          </span>
          <h1 className="mt-6 text-5xl font-extrabold leading-[1.03] tracking-tight sm:text-6xl md:text-7xl">
            {HERO.title[0]}
            <br />
            <span className="text-blue-glow">{HERO.title[1]}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">{HERO.sub}</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button href={CHECKOUT_URL} variant="primary">Start for {PRICE.amount}/wk</Button>
            <Button href="#features" variant="ghost">See it fly</Button>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-white/55">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-success" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
            {HERO.trust}
          </p>
        </div>
      </div>

      {/* Fade into the light body (Dawn Departure). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-transparent to-white" />
    </section>
  )
}
