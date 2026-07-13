import { Reveal } from '../components/ui/Reveal'
import { Annotation } from '../components/ui/Annotation'
import { AI } from '../config'

/**
 * Chapter — The onboard copilot (night world). Optional on-device AI: writing,
 * personalization, reply triage, deliverability review — all running locally. The
 * privacy line ("never leaves the cockpit") is the whole pitch, so the section
 * leads with it and wears the "runs on your machine · no cloud" badge up top.
 */
export function C04bCopilot() {
  return (
    <section id="ai" className="night-panel relative overflow-hidden px-5 py-28 text-white">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <Annotation code="03.5" label="The onboard copilot" className="text-white/45" />
          <h2 className="mt-4 max-w-3xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{AI.title}</h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/70">{AI.sub}</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 font-mono text-xs uppercase tracking-[.18em] text-blue-glow">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-success/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Runs on your machine · no cloud
          </div>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AI.points.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) * 0.06}>
              <div className="h-full rounded-2xl border border-white/12 bg-white/[0.04] p-6">
                <h3 className="font-display text-lg font-bold text-white">{p.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/70">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
