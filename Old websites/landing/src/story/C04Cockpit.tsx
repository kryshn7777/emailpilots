import { Reveal } from '../components/ui/Reveal'
import { Annotation } from '../components/ui/Annotation'
import { DeviceFrame } from '../components/ui/DeviceFrame'
import { AI, FEATURE_GROUPS, SHOTS } from '../config'

/**
 * Chapter 02 — The cockpit (blueprint world). Leads with the on-device AI
 * copilot (the whole pitch), wears the "runs on your machine · no cloud" badge,
 * then lays out the feature panel underneath.
 */
export function C04Cockpit() {
  return (
    <section id="features" className="relative px-5 py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <Annotation code="02.0" label="The cockpit" />
          <h2 className="mt-4 max-w-3xl font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            {AI.title}
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-mute">{AI.sub}</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-paper-line bg-white/70 px-3 py-1 font-mono text-xs uppercase tracking-[.18em] text-blue">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-success/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Runs on your machine · no cloud
          </div>
        </Reveal>

        {/* Product shots */}
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {SHOTS.map((s, i) => (
            <Reveal key={s.src} delay={i * 0.06}>
              <figure>
                <DeviceFrame src={s.src} alt={`${s.label} — ${s.caption}`} />
                <figcaption className="mt-3 text-sm text-slate-mute"><span className="font-semibold text-ink">{s.label}.</span> {s.caption}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        {/* Feature instruments */}
        <Reveal>
          <h3 className="mt-20 font-display text-2xl font-bold text-ink">Every instrument, on one panel.</h3>
        </Reveal>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_GROUPS.map((g, i) => (
            <Reveal key={g.title} delay={(i % 3) * 0.06}>
              <div className="blueprint-panel h-full rounded-2xl p-6">
                <h4 className="font-display text-lg font-bold text-ink">{g.title}</h4>
                <p className="mt-1.5 text-sm text-slate-mute">{g.blurb}</p>
                <ul className="mt-4 grid gap-2">
                  {g.items.map((it) => (
                    <li key={it} className="flex items-start gap-2 text-[13.5px] leading-snug text-slate-ink">
                      <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
