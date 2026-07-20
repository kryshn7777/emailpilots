import React from 'react'
import ReactDOM from 'react-dom/client'
import { PageShell, Section, Bullets, Steps } from '../PageShell'
import { pageHref } from '../../lib/links'
import '../../styles/index.css'

/**
 * The app-password page. Mirrors the in-app rebuttal (not your account
 * password, mail only, revocable) for the reader who googled "gmail app
 * password" with the connect screen open — zero sunk cost, maximum suspicion.
 * The page's job is to survive that suspicion by being more careful than the
 * reader: it explains exactly what the key can and cannot do, tells them how
 * to take it back, and warns them against pasting it anywhere else.
 *
 * The Microsoft section states ecosystem facts only (Microsoft retired
 * password sending; connecting happens through Microsoft's own sign-in) and
 * makes NO claim about Email Pilots' own Microsoft flow — that claim becomes
 * true when the Entra registration (plan sub-project #1) ships, and writing it
 * early would be an O9-class forward-claim. See AUDIT-onboarding.md.
 */

function AppPasswords() {
  return (
    <PageShell
      title="What's a Gmail app password — and why does Email Pilots ask for one?"
      intro={
        <>
          It&rsquo;s not your Google password, it can&rsquo;t log into your account, and you can kill it with one click.
          Here&rsquo;s the whole picture — including how to take it back.
        </>
      }
    >
      <Section title="The short version" id="short-version">
        <p>
          A <strong className="text-ink">Gmail app password</strong> is a separate 16-character key that Google
          generates on request, so that <em>one specific app</em> can send and read mail on your behalf. It is not your
          account password. It doesn&rsquo;t change your account password. And revoking it takes one click and affects
          nothing else.
        </p>
        <p>
          Google requires it for exactly this situation: a mail app on your own computer talking to Gmail&rsquo;s
          servers directly. It only exists when your account has{' '}
          <strong className="text-ink">2-Step Verification</strong> on — so using one means your account is<em> more</em>{' '}
          protected than a password-only account, not less.
        </p>
      </Section>

      <Section title="Create one in about two minutes" id="create">
        <Steps
          items={[
            <>
              Turn on <strong className="text-ink">2-Step Verification</strong> if you haven&rsquo;t —{' '}
              <span className="whitespace-nowrap">myaccount.google.com &rarr; Security</span>. (Google won&rsquo;t offer
              app passwords without it.)
            </>,
            <>
              Open{' '}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue underline underline-offset-2 hover:text-blue-600"
              >
                myaccount.google.com/apppasswords
              </a>{' '}
              — you&rsquo;ll be asked to confirm it&rsquo;s you.
            </>,
            <>
              Give it a name you&rsquo;ll recognise later — <em>Email Pilots</em> — and click{' '}
              <strong className="text-ink">Create</strong>.
            </>,
            <>
              Copy the 16-character code and paste it into Email Pilots&rsquo; connect screen. Don&rsquo;t worry about
              the spaces — they don&rsquo;t matter.
            </>,
          ]}
        />
        <p>
          You only do this once. Google shows the code a single time; if you lose it, you don&rsquo;t recover it — you
          just revoke it and make a new one.
        </p>
      </Section>

      <Section title="What it can do — and what it can't" id="scope">
        <p>Email Pilots uses the app password for exactly two things, both on your machine:</p>
        <Bullets
          items={[
            <>
              <strong className="text-ink">Send your emails</strong> through Gmail&rsquo;s own server (SMTP) — the same
              route the Gmail app uses.
            </>,
            <>
              <strong className="text-ink">Check your inbox for replies</strong> (IMAP), so follow-ups stop when someone
              answers.
            </>,
          ]}
        />
        <p>What an app password can&rsquo;t do:</p>
        <Bullets
          items={[
            <>It can&rsquo;t sign in to your Google Account in a browser.</>,
            <>It can&rsquo;t change your password, your recovery options, or any account setting.</>,
            <>It doesn&rsquo;t touch Drive, Photos, Contacts, or anything beyond mail.</>,
          ]}
        />
        <p>
          On your machine, the key is stored encrypted with Windows&rsquo; own user-level encryption — it&rsquo;s never
          written anywhere in plain text, never shown again in the app, and never sent to anyone but Google when mail
          moves. There&rsquo;s no server of ours to send it to: the app has none. Details in the{' '}
          <a href={pageHref('privacy')} className="text-blue underline underline-offset-2 hover:text-blue-600">
            privacy policy
          </a>
          .
        </p>
      </Section>

      <Section title="Taking it back — revoking access" id="revoke">
        <p>
          Go back to{' '}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue underline underline-offset-2 hover:text-blue-600"
          >
            myaccount.google.com/apppasswords
          </a>{' '}
          and delete the <em>Email Pilots</em> entry. Access ends instantly — nothing to uninstall first, nothing else
          affected. If you ever stop using Email Pilots, please do exactly that. A key you&rsquo;re not using is a key
          you shouldn&rsquo;t keep.
        </p>
      </Section>

      <Section title="Treat it like a key — because it is one" id="safety">
        <Bullets
          items={[
            <>
              Type it into the Email Pilots app on your computer, and{' '}
              <strong className="text-ink">nowhere else</strong>. No website — including this one — should ever ask you
              for it. This page never will.
            </>,
            <>Don&rsquo;t email it, message it, or screenshot it to anyone. Nobody legitimate will ask.</>,
            <>If you&rsquo;re ever unsure whether a key is still in use, revoke it and make a new one — it costs two minutes.</>,
          ]}
        />
      </Section>

      <Section title={'Why not just "Sign in with Google"?'} id="why-not-oauth">
        <p>
          Fair question. Google&rsquo;s sign-in flow for full mail access is built for cloud services — it requires the
          app to pass a paid third-party security audit and run verified infrastructure. Email Pilots is deliberately
          the opposite of that: a local program with no servers at all. For an app like this, the app password is
          Google&rsquo;s own supported mechanism — scoped to mail, revocable, and entirely under your control.
        </p>
      </Section>

      <Section title="Using Outlook or Hotmail? You won't need any of this" id="microsoft">
        <p>
          Microsoft <strong className="text-ink">retired app passwords and password-based sending entirely</strong> —
          for personal accounts (Outlook.com, Hotmail, Live) in September 2024, and for Microsoft 365 in early 2026. No
          mail app anywhere can send with an Outlook password any more; that&rsquo;s Microsoft&rsquo;s change, across
          the board. Microsoft accounts connect through Microsoft&rsquo;s own sign-in page instead — you prove
          it&rsquo;s you directly to Microsoft, and no password is ever typed into a third-party app at all.
        </p>
      </Section>
    </PageShell>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppPasswords />
  </React.StrictMode>,
)
