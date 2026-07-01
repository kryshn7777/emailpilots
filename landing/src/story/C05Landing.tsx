import { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Annotation } from '../components/ui/Annotation'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const STAGES = [
  { tag: 'Inbound', title: 'Your message lands.', body: 'Sent at a natural pace from your own address — it arrives like a note from a person, not a broadcast.' },
  { tag: 'Reply', title: 'They write back.', body: 'A read-only inbox check notices the reply. No tracking pixels, no rewriting your links.' },
  { tag: 'Cleared', title: 'Follow-ups stop — automatically.', body: 'The moment someone replies, the sequence halts. You step in only for the conversations that matter.' },
]

/** Chapter 05 — Landing & reply (day→dusk). A pinned three-beat: land, reply, stop. */
export function C05Landing() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(min-width: 769px) and (prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: 'top top', end: '+=200%', pin: true, scrub: true },
        })
        const cards = gsap.utils.toArray<HTMLElement>('.land-stage')
        cards.forEach((card, i) => {
          if (i > 0) tl.fromTo(card, { autoAlpha: 0, yPercent: 12 }, { autoAlpha: 1, yPercent: 0 }, i)
          if (i < cards.length - 1) tl.to(card, { autoAlpha: 0, yPercent: -12 }, i + 0.85)
        })
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} id="landing" className="night-panel relative overflow-hidden text-white">
      <div className="relative mx-auto flex min-h-screen max-w-4xl items-center px-5 py-28">
        <div className="relative w-full">
          <Annotation code="04.0" label="Final approach" className="text-white/45" />
          <div className="relative mt-6 h-64">
            {STAGES.map((s, i) => (
              <div
                key={s.tag}
                className="land-stage absolute inset-0"
                style={i === 0 ? undefined : { opacity: 0 }}
              >
                <div className="font-mono text-xs uppercase tracking-[.24em] text-success">{s.tag}</div>
                <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">{s.title}</h2>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
