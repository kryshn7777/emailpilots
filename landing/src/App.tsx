import { ReactLenis, useLenis } from 'lenis/react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef } from 'react'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { StatBand } from './components/StatBand'
import { HowItWorks } from './components/HowItWorks'
import { Moat } from './components/Moat'
import { Features } from './components/Features'
import { ProductShots } from './components/ProductShots'
import { Deliverability } from './components/Deliverability'
import { Comparison } from './components/Comparison'
import { WhoFor } from './components/WhoFor'
import { Pricing } from './components/Pricing'
import { FAQ } from './components/FAQ'
import { FinalCTA } from './components/FinalCTA'
import { Footer } from './components/Footer'

gsap.registerPlugin(ScrollTrigger)

function Content() {
  // Keep ScrollTrigger in sync with Lenis' smooth scroll position.
  useLenis(() => ScrollTrigger.update())
  return (
    <>
      <Header />
      <main className="relative">
        <Hero />
        <StatBand />
        <HowItWorks />
        <Moat />
        <Features />
        <ProductShots />
        <Deliverability />
        <Comparison />
        <WhoFor />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}

export default function App() {
  const lenisRef = useRef<any>(null)

  useEffect(() => {
    // Drive Lenis from GSAP's ticker (single rAF) — pattern from Lenis + GSAP docs.
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time * 1000)
    }
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)
    return () => gsap.ticker.remove(update)
  }, [])

  return (
    <ReactLenis root options={{ autoRaf: false, lerp: 0.1 }} ref={lenisRef}>
      <Content />
    </ReactLenis>
  )
}
