import React from 'react'
import ReactDOM from 'react-dom/client'
import { PageShell, Section, Bullets, Steps } from '../PageShell'
import { pageHref } from '../../lib/links'
import '../../styles/index.css'

/**
 * Install help — the SmartScreen page.
 *
 * The reader is a stranger with zero sunk cost and a blue warning dialog on
 * screen right now. Everything here is condition-first ("IF Windows shows…"),
 * so the page stays correct before and after the installer is code-signed.
 *
 * Two content rules, from the plan gate:
 *  - No claim about a Digital Signatures tab — an unsigned binary has none.
 *  - Explain the warning honestly instead of waving it away; the page IS the
 *    trust content. Encouraging the reader's caution (scan it, check the
 *    source) builds more trust than minimizing it.
 */

const CONTACT = 'emailpilots.sales@gmail.com'

function Install() {
  return (
    <PageShell
      title={'Seeing “Windows protected your PC”?'}
      intro={
        <>
          You&rsquo;re not doing anything wrong, and neither is your computer. Here&rsquo;s what that blue dialog
          actually means, and how to continue safely — about thirty seconds of reading.
        </>
      }
    >
      <Section title="The short version" id="short-version">
        <p>
          If Windows shows the blue <strong className="text-ink">&ldquo;Windows protected your PC&rdquo;</strong> screen
          when you run the Email Pilots installer:
        </p>
        <Steps
          items={[
            <>
              Click <strong className="text-ink">More info</strong> (small text under the message).
            </>,
            <>
              Click <strong className="text-ink">Run anyway</strong>.
            </>,
          ]}
        />
        <p>
          That&rsquo;s it. The dialog appears once for that download — Windows remembers your choice for that copy of the
          installer.
        </p>
      </Section>

      <Section title={'What does “Windows protected your PC” actually mean?'} id="what-it-means">
        <p>
          The dialog comes from <strong className="text-ink">Microsoft Defender SmartScreen</strong>, and it&rsquo;s a{' '}
          <em>reputation</em> check, not a virus verdict. SmartScreen counts how many people have downloaded and run a
          particular file. Brand-new apps — and every new release of a small app — start that counter at zero, so
          Windows shows a caution screen until enough people have run that exact file.
        </p>
        <p>
          That&rsquo;s why the message says <em>&ldquo;unrecognized app&rdquo;</em>: it means Windows hasn&rsquo;t seen
          this file often enough to vouch for it yet. Nothing harmful was found — antivirus scanning is a separate
          system, and it still runs on the file as normal.
        </p>
        <p>
          Why not just make the warning go away? Because reputation has to be earned — per release, by real downloads —
          and there is no honest shortcut a small tool can buy overnight. Until it accumulates, we&rsquo;d rather
          explain the warning plainly than pretend it isn&rsquo;t there.
        </p>
      </Section>

      <Section title="If your browser holds the download first" id="browser-warning">
        <p>
          Edge and Chrome sometimes pause the download itself with a message like{' '}
          <em>&ldquo;…isn&rsquo;t commonly downloaded.&rdquo;</em> Same reputation logic, same reason. Open the
          download&rsquo;s menu (the <strong className="text-ink">&hellip;</strong> next to it) and choose{' '}
          <strong className="text-ink">Keep</strong> — in Edge it&rsquo;s sometimes behind{' '}
          <strong className="text-ink">Show more</strong> → <strong className="text-ink">Keep anyway</strong>.
        </p>
      </Section>

      <Section title="Sensible precautions — please do take them" id="precautions">
        <p>
          A warning screen is a fine moment to be careful. These checks take under a minute and we encourage every one
          of them:
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-ink">Download only from this website.</strong> If the installer reached you any
              other way — an email attachment, a re-upload, a &ldquo;mirror&rdquo; — delete it and download it here
              instead.
            </>,
            <>
              <strong className="text-ink">Scan it yourself.</strong> Right-click the downloaded file and choose{' '}
              <strong className="text-ink">Scan with Microsoft Defender</strong> for a second opinion before running it.
            </>,
            <>
              <strong className="text-ink">Check the name on the dialog.</strong> The warning names the app it&rsquo;s
              asking about — it should be the Email Pilots installer you just downloaded. If it names something else,
              stop.
            </>,
          ]}
        />
        <p>
          If Windows ever removes the file outright instead of warning (a false positive that can happen to new
          releases), re-download from this site — and if it repeats, tell us at{' '}
          <a href={`mailto:${CONTACT}`} className="text-blue underline underline-offset-2 hover:text-blue-600">
            {CONTACT}
          </a>{' '}
          so we can get the release cleared.
        </p>
      </Section>

      <Section title="What installing does — and doesn't — do" id="after-install">
        <p>
          Installing Email Pilots connects nothing. There&rsquo;s no account to create and no server of ours in the
          middle: the app runs entirely on your machine and only ever talks to your own email provider, and only after
          you add your email account inside the app. Until you do that, it has nothing of yours at all.
        </p>
        <p>
          The full detail, in plain language, is in the{' '}
          <a href={pageHref('privacy')} className="text-blue underline underline-offset-2 hover:text-blue-600">
            privacy policy
          </a>
          .
        </p>
        <p>
          Next step — connecting Gmail?{' '}
          <a href={pageHref('app-passwords')} className="text-blue underline underline-offset-2 hover:text-blue-600">
            Here&rsquo;s what an app password is
          </a>{' '}
          — and what it can&rsquo;t do.
        </p>
      </Section>
    </PageShell>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Install />
  </React.StrictMode>,
)
