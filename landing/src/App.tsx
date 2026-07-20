import { ReactLenis, useLenis } from 'lenis/react'
import { MotionConfig } from 'motion/react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { Hud } from './components/Hud'
import { RouteLine } from './components/RouteLine'
import { Story } from './story/Story'
import { scroll, chapterIndex, prefersReducedMotion } from './lib/scroll'

gsap.registerPlugin(ScrollTrigger)

const SkyCanvas = lazy(() => import('./three/SkyCanvas'))

function Content() {
  useLenis((lenis: any) => {
    ScrollTrigger.update()
    scroll.y = lenis?.scroll ?? window.scrollY
    scroll.progress = lenis?.progress ?? 0
    scroll.chapter = chapterIndex(scroll.progress)
  })
  return (
    <>
      <Header />
      <Hud />
      <Story />
    </>
  )
}

export default function App() {
  const lenisRef = useRef<any>(null)
  const [showSky, setShowSky] = useState(false)

  useEffect(() => {
    // Respect prefers-reduced-motion: never mount the auto-playing 3D scene.
    if (prefersReducedMotion) return
    const ric = (window as any).requestIdleCallback
    if (ric) {
      const h = ric(() => setShowSky(true), { timeout: 1500 })
      return () => (window as any).cancelIdleCallback?.(h)
    }
    const h = setTimeout(() => setShowSky(true), 400)
    return () => clearTimeout(h)
  }, [])

  useEffect(() => {
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time * 1000)
    }
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)
    return () => gsap.ticker.remove(update)
  }, [])

  // Land on the right section when the URL arrives with a hash — a shared
  // /#pricing link, or the standalone pages (install, privacy, …) linking back
  // to /#features.
  //
  // The browser fires its native scroll-to-fragment at document load, before
  // React has rendered Story. The section doesn't exist yet, so the anchor is
  // silently dropped and you land at the top; nothing retries once it mounts.
  // Same-page clicks are unaffected — the section is already in the DOM.
  //
  // scrollIntoView, deliberately, not lenis.scrollTo:
  //  - it honours the CSS scroll-margin-top (styles/index.css) that clears the
  //    fixed header, so the offset stays in one place instead of a magic number;
  //  - it doesn't depend on Lenis having finished initialising. Going through
  //    the Lenis ref raced — on a link-click navigation the ref was still empty
  //    a frame after mount, and optional chaining turned that into a silent
  //    no-op that only reproduced on some navigations.
  // Verified: Lenis syncs to the native jump and holds it; it does not lerp back.
  useEffect(() => {
    const hash = window.location.hash
    if (hash.length < 2) return

    let el: Element | null = null
    try {
      // A fragment need not be a valid selector (#123, #!foo) — querySelector throws.
      el = document.querySelector(hash)
    } catch {
      return
    }
    if (!el) return

    const target = el
    // One frame, so first paint/layout settles before we measure and jump.
    const raf = requestAnimationFrame(() => target.scrollIntoView())
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <ReactLenis root options={{ autoRaf: false, lerp: 0.1 }} ref={lenisRef}>
      <div className="pointer-events-none fixed inset-0 -z-20 bg-white" />
      <div className="grid-paper pointer-events-none fixed inset-0 -z-20 opacity-70" />
      {/* Hero night sky: absolute (scrolls away with the hero) so it never
          tints the light blueprint chapters below. Sits behind the 3D canvas. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-screen"
        style={{ background: 'linear-gradient(180deg,#0a1430 0%,#0c1838 55%,rgba(247,249,252,0) 100%)' }}
      />
      <div className="pointer-events-none fixed inset-0 -z-10">
        {showSky && (
          <Suspense fallback={null}>
            <SkyCanvas />
          </Suspense>
        )}
      </div>
      <RouteLine />
      <MotionConfig reducedMotion="user">
        <Content />
      </MotionConfig>
    </ReactLenis>
  )
}
