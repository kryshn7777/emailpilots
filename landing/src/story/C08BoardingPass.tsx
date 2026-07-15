import { Reveal } from '../components/ui/Reveal'
import { Annotation } from '../components/ui/Annotation'
import { BoardingPass } from '../components/ui/BoardingPass'
import { Button } from '../components/ui/Button'
import { Footer } from '../components/Footer'
import { PRICE, PRICING_INCLUDES, PLAN, CHECKOUT_URL, COMING_SOON, FAQ, FINAL } from '../config'

/**
 * Chapter 05 — Final approach. The Solo ticket, a slim "Business & Teams coming
 * soon" strip, the FAQ, the closing CTA, and the footer — one coherent close.
 * Light "blueprint" ticket up top; the FAQ/CTA/footer sit in the night world.
 */
export function C08BoardingPass() {
  return (
    <section id="pricing" className="relative">
      {/* Ticket + coming-soon strip (blueprint world) */}
      <div className="px-5 py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="text-center">
              <Annotation code="05.0" label="Boarding pass" className="justify-center" />
              <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">One ticket. Everything included.</h2>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-14">
              <BoardingPass
                plan={PLAN.name}
                tagline={PLAN.tagline}
                price={PRICE.amount}
                period={PRICE.period}
                trialDays={PRICE.trialDays}
                includes={PRICING_INCLUDES}
                ctaHref={CHECKOUT_URL}
              />
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-paper-line bg-white/60 px-6 py-4 text-center">
              <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-warn">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                Coming soon
              </span>
              <span className="text-sm text-slate-ink"><span className="font-semibold text-ink">Business &amp; Teams</span> — {COMING_SOON.summary}</span>
              <a href={COMING_SOON.waitlistHref} className="text-sm font-bold text-blue hover:underline">Get notified →</a>
            </div>
          </Reveal>
        </div>
      </div>

      {/* FAQ + closing CTA + footer (night world) */}
      <div className="night-panel relative overflow-hidden text-white">
        <div className="mx-auto max-w-4xl px-5 py-28">
          <Reveal>
            <Annotation code="05.1" label="Before you board" className="text-white/45" />
            <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Pre-flight questions.</h2>
          </Reveal>
          <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={(i % 5) * 0.04}>
                <details className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold text-white">
                    {f.q}
                    <span className="text-blue-glow transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 max-w-2xl leading-relaxed text-white/70">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="mt-24 text-center">
              <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">{FINAL.title}</h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/70">{FINAL.sub}</p>
              <div className="mt-9 flex justify-center">
                <Button href={CHECKOUT_URL} variant="primary">Start for {PRICE.amount}/wk</Button>
              </div>
            </div>
          </Reveal>
        </div>
        <Footer />
      </div>
    </section>
  )
}
