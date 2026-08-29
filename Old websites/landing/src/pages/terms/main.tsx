import React from 'react'
import ReactDOM from 'react-dom/client'
import { PageShell, Section, Bullets } from '../PageShell'
import { PRICE, PROMO } from '../../config'
import '../../styles/index.css'

/**
 * Terms and conditions. Mirrors docs/terms-and-conditions.md — this page is the
 * published artifact, so keep the two in step when either changes.
 *
 * The price is read from config.ts (PRICE), NOT written out here. The markdown
 * draft said "€2 per week" while the site advertised $2.9/week — a contract
 * naming a price the checkout doesn't charge. Deriving it from the same constant
 * the Header, ticket and FAQ already use makes that drift structurally
 * impossible rather than merely fixed once.
 */

const EFFECTIVE = '14 June 2026'
const CONTACT = 'emailpilots.sales@gmail.com'

function Terms() {
  return (
    <PageShell
      title="Terms and Conditions"
      intro={
        <>
          <span className="font-semibold text-ink">Effective date:</span> {EFFECTIVE}
        </>
      }
    >
      <p>
        These Terms and Conditions (&ldquo;Terms&rdquo;) govern your access to and use of the Email Pilots website and
        desktop application (collectively, the &ldquo;Service&rdquo;), operated by Email Pilots (&ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;), a sole proprietorship based in India. By accessing or using the Service,
        you agree to be bound by these Terms. If you disagree with any part of them, you may not access the Service.
      </p>

      <Section title="1. Description of service" id="service">
        <p>
          Email Pilots provides a downloadable, locally-hosted software application designed to schedule and automate
          email outreach. The software connects directly to your own email accounts and SMTP credentials and operates
          entirely on your local machine.
        </p>
      </Section>

      <Section title="2. Subscriptions and payments" id="payments">
        <Bullets
          items={[
            <>
              <strong className="text-ink">Pricing and billing:</strong> the Service is currently priced at{' '}
              {PRICE.amount} per {PRICE.period}. We reserve the right to modify our pricing at any time.
            </>,
            <>
              <strong className="text-ink">Launch offer:</strong> if you install the software for the first time before{' '}
              {PROMO.cutoffLabel}, the paid features are unlocked free for {PROMO.days} days from that first launch. The
              offer needs no payment details and starts no subscription — nothing is charged unless you choose to
              subscribe. The {PROMO.days} days are granted and counted locally on your own machine, once per
              installation, and are not transferable or redeemable for money. First installations after that date
              receive a {PRICE.trialDays}-day trial instead. We may withdraw the offer for future installations at any
              time; an offer already granted to you runs its full term.
            </>,
            <>
              <strong className="text-ink">When free access ends:</strong> the software keeps working and your data
              stays yours. Automated follow-up sequences require an active subscription.
            </>,
            <>
              <strong className="text-ink">Merchant of Record:</strong> all payments, subscriptions, and billing inquiries
              are processed securely through our Merchant of Record,{' '}
              <strong className="text-ink">LemonSqueezy</strong>. By subscribing, you also agree to LemonSqueezy&rsquo;s
              terms of service.
            </>,
            <>
              <strong className="text-ink">Referral program:</strong> users may participate in our referral program. For
              each successful referral, you will receive two (2) free weeks credited to your subscription. We reserve the
              right to modify, suspend, or terminate the referral program at any time, especially in cases of suspected
              abuse.
            </>,
          ]}
        />
      </Section>

      <Section title="3. Refund policy" id="refunds">
        <p>
          We offer a strict <strong className="text-ink">14-day money-back guarantee</strong> for your initial purchase.
          If you are not satisfied with the Service, you may request a full refund within exactly 14 days of your initial
          subscription payment. To request a refund, contact us at the address below. Subsequent recurring subscription
          charges or renewals are not eligible for refunds.
        </p>
      </Section>

      <Section title="4. Acceptable use and anti-spam policy" id="acceptable-use">
        <p>
          Email Pilots is a tool intended to facilitate legitimate, lawful outreach. You agree{' '}
          <strong className="text-ink">not</strong> to use the Service to send unsolicited spam, malicious software,
          phishing attempts, or fraudulent content.
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-ink">User liability and compliance:</strong> the application includes a built-in
              spam checker that provides advisory warnings about your email content (for example, flagging ALL CAPS
              subjects, missing plain-text alternatives, or specific trigger words). The application{' '}
              <em>does not strictly block</em> sends based on these heuristics. You are solely responsible for reviewing
              these warnings and ensuring that all emails sent via the Service comply with applicable local and
              international anti-spam laws, including but not limited to the CAN-SPAM Act, the GDPR, and the CCPA.
            </>,
            <>
              <strong className="text-ink">Automatic bounce management:</strong> the application automatically intercepts
              permanent SMTP envelope rejection errors (5xx) and adds those addresses to a local suppression list. You
              agree not to tamper with, circumvent, or bypass this suppression mechanism to forcefully re-email bounced
              addresses.
            </>,
            <>
              <strong className="text-ink">Account and domain reputation:</strong> because the application connects
              directly to your SMTP provider, you are solely responsible for maintaining the health, reputation, and
              limits of your email accounts and domains. We accept no liability if your email account is restricted,
              suspended, or banned by your provider due to sending volume, user complaints, hard bounces, or policy
              violations.
            </>,
          ]}
        />
      </Section>

      <Section title="5. Limitation of liability" id="liability">
        <p>
          The Service is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis without warranties of any
          kind, either express or implied. To the fullest extent permitted by applicable law, Email Pilots and its
          proprietor shall not be liable for any indirect, incidental, special, consequential, or punitive damages,
          including but not limited to loss of profits, loss of data, loss of email account access, or business
          interruption arising out of your use of, or inability to use, the Service.
        </p>
      </Section>

      <Section title="6. Intellectual property" id="ip">
        <p>
          Email Pilots retains all rights, title, and interest in and to the Service, including the desktop application,
          website, logos, and associated branding. Your subscription grants you a limited, non-exclusive,
          non-transferable, and revocable license to download and use the software for your own personal or internal
          business purposes. You may not reverse-engineer, redistribute, or resell the software.
        </p>
      </Section>

      <Section title="7. Governing law and dispute resolution" id="law">
        <p>
          These Terms shall be governed by and construed in accordance with the laws of India, without regard to its
          conflict of law provisions. Any legal disputes arising from or relating to these Terms or the Service shall be
          resolved exclusively in the competent courts located in India.
        </p>
      </Section>

      <Section title="8. Changes to these terms" id="changes">
        <p>
          We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will notify you
          of any changes by posting the new Terms on this page and updating the effective date above. Your continued use
          of the Service after any changes are posted constitutes your acceptance of the new Terms.
        </p>
      </Section>

      <Section title="9. Contact information" id="contact">
        <p>
          For support, refund requests, or legal inquiries regarding these Terms:{' '}
          <a href={`mailto:${CONTACT}`} className="text-blue underline underline-offset-2 hover:text-blue-600">
            {CONTACT}
          </a>
        </p>
      </Section>
    </PageShell>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Terms />
  </React.StrictMode>,
)
