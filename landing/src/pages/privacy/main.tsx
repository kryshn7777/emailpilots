import React from 'react'
import ReactDOM from 'react-dom/client'
import { PageShell, Section, Bullets } from '../PageShell'
import '../../styles/index.css'

/**
 * Privacy policy. Mirrors docs/privacy-policy.md — this page is the published
 * artifact, so keep the two in step when either changes.
 *
 * Deliberately imports only PageShell + the stylesheet: no App, so no
 * three/gsap/lenis. Someone reading a privacy policy wants the text now.
 */

const EFFECTIVE = '14 June 2026'
const CONTACT = 'emailpilots.sales@gmail.com'

function Privacy() {
  return (
    <PageShell
      title="Privacy Policy"
      intro={
        <>
          <span className="font-semibold text-ink">Effective date:</span> {EFFECTIVE}
        </>
      }
    >
      <p>
        This Privacy Policy explains how Email Pilots (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), operating as a
        sole proprietorship in India, collects, uses, discloses, and safeguards your information when you visit our
        website or use the Email Pilots desktop application (collectively, the &ldquo;Service&rdquo;). Please read this
        Privacy Policy carefully. If you do not agree with its terms, please do not access the Service.
      </p>

      <Section title="1. The Email Pilots desktop application" id="app">
        <p>
          We fundamentally believe that your data belongs to you. The Email Pilots desktop application is architected to
          operate <strong className="text-ink">100% locally on your machine</strong>.
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-ink">No data harvesting or telemetry:</strong> the application contains zero network
              telemetry, crash reporting, or tracking scripts. It makes no HTTP requests to our servers or to any
              third-party analytics provider.
            </>,
            <>
              <strong className="text-ink">Local data storage:</strong> all configuration and operational data — your
              recipient lists, sending limits, suppressed emails, and templates — are stored solely on your local hard
              drive.
            </>,
            <>
              <strong className="text-ink">Direct SMTP connections:</strong> the application connects directly from your
              computer to your chosen SMTP provider. Your emails, attachments, and recipient data never pass through,
              touch, or get processed by our servers.
            </>,
            <>
              <strong className="text-ink">Secure credentials:</strong> your SMTP credentials (such as app passwords) are
              stored entirely locally. We have no access to your credentials or your email accounts.
            </>,
          ]}
        />
      </Section>

      <Section title="2. Information we collect on our website" id="website">
        <p>
          While the desktop application is fully local and private, we do collect certain information when you interact
          with our website.
        </p>
        <h3 className="font-display font-semibold text-ink">A. Personal data</h3>
        <p>
          When you purchase a subscription or contact us, we may collect personally identifiable information such as your
          name, email address, and billing address.
        </p>
        <h3 className="font-display font-semibold text-ink">B. Payment information</h3>
        <p>
          All subscription payments are processed securely through our Merchant of Record,{' '}
          <strong className="text-ink">LemonSqueezy</strong>. When you make a purchase, LemonSqueezy collects and
          processes your payment details. We do not process, store, or have direct access to your full payment card
          information. See{' '}
          <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue underline underline-offset-2 hover:text-blue-600">
            LemonSqueezy&rsquo;s privacy policy
          </a>{' '}
          for how they handle your data.
        </p>
        <h3 className="font-display font-semibold text-ink">C. Usage data and analytics</h3>
        <p>
          We use <strong className="text-ink">Google Analytics</strong> to monitor and analyze web traffic on our website.
          Google Analytics may collect data such as your IP address, browser type, operating system, referring URLs, and
          pages viewed. This data is used to improve our website&rsquo;s user experience. You can opt out using browser
          extensions or by adjusting your cookie preferences.
        </p>
      </Section>

      <Section title="3. How we use your information" id="use">
        <Bullets
          items={[
            'Provide, operate, and maintain our Service.',
            'Process your subscription payments and renewals (via LemonSqueezy).',
            'Respond to your customer service requests and support needs.',
            'Monitor website usage and analyze trends to improve our marketing and web presence.',
            'Prevent fraudulent transactions and monitor against theft.',
          ]}
        />
      </Section>

      <Section title="4. Sharing your information" id="sharing">
        <p>We do not sell, trade, or rent your personal information to third parties. We may share it only:</p>
        <Bullets
          items={[
            <>
              <strong className="text-ink">With service providers:</strong> we share necessary data with LemonSqueezy to
              facilitate payment processing.
            </>,
            <>
              <strong className="text-ink">For analytics:</strong> we share anonymized website usage data with Google
              Analytics.
            </>,
            <>
              <strong className="text-ink">By law:</strong> we may disclose your information if required to do so by law or
              in response to valid requests by public authorities.
            </>,
          ]}
        />
      </Section>

      <Section title="5. Data security" id="security">
        <p>
          We use administrative, technical, and physical security measures to help protect your personal information.
          However, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed
          against interception or misuse. For the desktop application, you are responsible for the security of the data,
          recipient lists, and SMTP credentials stored on your own device.
        </p>
      </Section>

      <Section title="6. Your rights" id="rights">
        <p>
          Depending on your location, you may have rights regarding your personal data, including the right to access,
          correct, or delete the personal information we have collected via our website or payment processor. To delete
          the data associated with the desktop app, uninstall the application and delete its local configuration
          directory from your computer.
        </p>
      </Section>

      <Section title="7. Governing law" id="law">
        <p>
          This Privacy Policy and your use of the Service are governed by and construed in accordance with the laws of
          India.
        </p>
      </Section>

      <Section title="8. Changes to this policy" id="changes">
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy
          on this page and updating the effective date above. Please review it periodically.
        </p>
      </Section>

      <Section title="9. Contact us" id="contact">
        <p>
          Questions or concerns about this policy or our privacy practices?{' '}
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
    <Privacy />
  </React.StrictMode>,
)
