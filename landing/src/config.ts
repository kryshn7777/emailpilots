// Single source of truth for copy, pricing, and the full feature list.
// Positioning: a PERSONAL outreach + follow-up assistant that sends from your
// own mailbox. Deliberately NOT framed as cold-email / bulk / "anti-ban" — that
// language risks payment-processor bans and misreads as spam tooling.

/** Paste a real Stripe Payment Link / Lemon Squeezy / Gumroad URL here.
 *  Defaults to the on-page pricing anchor until you have one. */
export const CHECKOUT_URL = '#pricing'

export const PRICE = { amount: '$2.9', period: 'week', trialDays: 7 }

export const NAV = [
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Why us', href: '#why' },
  { label: 'Pricing', href: '#pricing' },
]

export const HERO = {
  kicker: '✈ AI-powered · runs on your machine',
  title: ['Personal outreach,', 'supercharged by AI.'],
  sub: 'A built-in AI copilot writes every email in your voice, personalizes it to each person, follows up on schedule, and reads every reply so it knows exactly when to step aside — all running on your own computer. Your contacts and credentials never leave your machine.',
  trust: 'Smart enough to sound human. Private enough to trust — the AI runs on your device, never the cloud.',
}

export const STATS = [
  { value: 'Your', label: 'mailbox — Gmail, Outlook or custom' },
  { value: '5', label: 'accounts, organized in one place' },
  { value: '100%', label: 'local — your data stays on your device' },
  { value: '0', label: 'cloud servers, zero per-contact fees' },
]

// How it works — 3 plain steps.
export const HOW = [
  {
    step: '01',
    title: 'Connect your mailbox',
    body: 'Sign in with your own Gmail, Outlook, or your own custom email address. Your password is kept in your computer’s built-in vault — it never touches a server.',
  },
  {
    step: '02',
    title: 'Add contacts, let AI write',
    body: 'Import a CSV or add people by hand — then let the built-in AI draft a tailored message for every single one. Tweak with a click, run the pre-flight check, and you’re ready. No blank page, no copy-paste.',
  },
  {
    step: '03',
    title: 'AI flies the follow-ups',
    body: 'It sends on schedule at a natural pace, follows up automatically, and reads every reply to judge intent — stopping the instant someone’s interested. You only step in for the conversations that matter.',
  },
]

// Reframed from "anti-ban" to responsible-sending / deliverability hygiene.
export const SAFEGUARDS = [
  { concern: 'Sending too much, too fast', guard: 'Daily and hourly sending limits you control, enforced precisely' },
  { concern: 'New mailboxes straining', guard: 'Eases a brand-new account into volume, slowly' },
  { concern: 'Emailing people who opted out', guard: 'Automatic do-not-contact list for opt-outs and bounces' },
  { concern: 'Unnatural sending bursts', guard: 'Natural spacing and timing between every send' },
  { concern: 'Pestering someone who replied', guard: 'Follow-ups stop automatically the moment they respond' },
  { concern: 'Credentials at risk', guard: 'Passwords encrypted on your device, never in the cloud' },
]

// Deliverability section points.
export const DELIVERABILITY = {
  title: 'Built to stay welcome in the inbox.',
  sub: 'Good sending habits, handled for you — so the people you actually mean to reach actually hear from you.',
  points: [
    { title: 'Reads like a real person', body: 'Defaults to a personal 1:1 style — plain, personalized messages from your own name and address, not a templated blast.' },
    { title: 'Respects sensible limits', body: 'Stays within healthy daily volumes and paces sends naturally, the way a careful human would.' },
    { title: 'Honors every opt-out', body: 'One-click unsubscribe support and a permanent do-not-contact list keep you respectful and compliant.' },
    { title: 'AI guards every send', body: 'The built-in AI reviews each draft for spam-filter triggers and rewrites the risky parts before a single message leaves — so you land in the inbox, not the promotions tab.' },
  ],
}

// Plain-language trust proofs, folded into the "Why fly with us" chapter.
export const TRUST = [
  { title: 'Sends like a careful person', body: 'It paces your emails at natural, human times and eases a brand-new mailbox in slowly — never a robotic burst, always within the limits you set.' },
  { title: 'Respects every unsubscribe', body: 'One click opts anyone out for good. Opted-out and dead addresses are set aside automatically, shared across every account.' },
  { title: 'Checks each message before it flies', body: 'The built-in AI reviews every draft for anything that trips spam filters and fixes it — and all of it happens right on your own machine.' },
]

// On-device AI (Feature #5) — private, runs a local model on the user's own
// machine. Marketed as a built-in, core capability. Reinforces the privacy positioning.
export const AI = {
  title: 'A copilot that never leaves the cockpit.',
  sub: 'Your copilot writes every email in your voice, personalizes it to each person, reads every reply to know exactly what they mean, and double-checks it will land — all running on your own computer. No accounts, no cloud: the smarts of a big AI, with none of the exposure.',
}

export type FeatureGroup = { title: string; blurb: string; items: string[] }

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: 'Writes every email for you',
    blurb: 'Your on-device copilot drafts, personalizes, and perfects every message.',
    items: [
      'A tailored first draft for every single contact',
      'Rewrites, shortens, or fixes the tone in one click',
      'Drops each person’s name and details in naturally',
    ],
  },
  {
    title: 'Reads every reply, knows what to do',
    blurb: 'It watches for answers and handles them the way you would.',
    items: [
      'Quietly checks for replies — only reads your mailbox, never changes it',
      'Tells interested from not-now from out-of-office',
      'Files opt-outs and pauses follow-ups automatically',
    ],
  },
  {
    title: 'Follows up until they answer',
    blurb: 'Polite, on-schedule follow-ups that stop the moment someone replies.',
    items: [
      'Multi-step sequences with a natural wait between each',
      'Sends at natural, human-looking times',
      'Stops the instant they write back',
    ],
  },
  {
    title: 'Lands in the inbox, not spam',
    blurb: 'The copilot checks every message before it flies and tells you — in plain words — anything to fix.',
    items: [
      'Flags spam-filter triggers before you send',
      'Adds a one-click unsubscribe automatically',
      'Shows you exactly what to fix to reach inboxes',
    ],
  },
  {
    title: 'Runs on your machine — nothing leaves',
    blurb: 'The AI and all your data live on your own computer.',
    items: [
      'The AI runs locally — no accounts, no cloud',
      'Contacts and passwords never leave your device',
      'Passwords kept in your computer’s built-in vault',
    ],
  },
  {
    title: 'All your mailboxes in one place',
    blurb: 'Bring your accounts and contacts together, tidily.',
    items: [
      'Your main mailbox plus up to 5 more, each kept separate',
      'Import a CSV — duplicates and bad addresses skipped',
      'Group contacts into lists with their own message',
    ],
  },
]

// Who it's for — legitimate, permission-based personas.
export const WHO_FOR = [
  { who: 'Founders', body: 'Reach the partners, investors, and early customers you already have a reason to email — let AI draft each one and never drop a follow-up.' },
  { who: 'Recruiters', body: 'Stay in touch with candidates personally, on a schedule, without a candidate ever slipping through the cracks.' },
  { who: 'Job-seekers', body: 'Let AI craft a thoughtful, tailored application for every role — plus the polite follow-ups — all from your own inbox.' },
  { who: 'Freelancers & agencies', body: 'Nurture warm leads and past clients with personal check-ins that don’t feel automated.' },
]

// Comparison — no cold-email competitor names, no "vs spam" framing.
export const COMPARISON = [
  {
    them: 'vs email marketing platforms',
    point: 'Newsletter tools are built for one-to-many blasts from a shared sending domain. Email Pilots sends personal, 1:1 messages from your own address.',
  },
  {
    them: 'vs cloud outreach apps',
    point: 'They keep your contacts on their servers, bill per contact, and pipe your emails through someone else’s AI. Here your list, your credentials, and the AI itself all stay on your machine — one simple price.',
  },
  {
    them: 'vs bolt-on AI writers',
    point: 'Generic AI tools paste in a draft and forget the context. Email Pilots’ copilot knows each contact, learns from your past replies, respects your sending limits — and never sends a word to the cloud.',
  },
  {
    them: 'vs doing it by hand',
    point: 'Let AI write, schedule, personalize, follow up, and read every reply — without living inside your inbox all day.',
  },
]

export const PRICING_INCLUDES = [
  'Sensible daily limits to protect your mailbox',
  'Up to 5 accounts (Gmail / Outlook / custom)',
  'Scheduling & per-person personalization',
  'Reply-aware follow-up sequences',
  'Built-in AI — writes, personalizes & triages every email, on your machine',
  'CSV import, lists & opt-out handling',
  '100% local — your data never leaves your machine',
]

export const FAQ = [
  { q: 'Is this a bulk or spam tool?', a: 'No. Email Pilots is for personal, permission-based email you have a genuine reason to send — to your own contacts, from your own mailbox. It defaults to a personal 1:1 style, supports one-click unsubscribe, and keeps a do-not-contact list. It is not built for buying lists or blasting strangers.' },
  { q: 'Will it keep my mailbox in good standing?', a: 'That’s the whole point of the sending limits, easing new mailboxes in slowly, and natural pacing: to send the way a careful person would, stay within healthy volumes, and keep your messages welcome.' },
  { q: 'Where does my data live?', a: 'Entirely on your computer. There is no cloud backend — your contact list and passwords never leave your machine, and passwords are kept safe in your computer’s built-in vault.' },
  { q: 'Does the AI send my emails to the cloud?', a: 'Never. The AI is built in and runs directly on your own computer. There are no accounts to set up, and nothing — not a draft, a contact, or a reply — is ever sent to OpenAI, to us, or to any server. You get the intelligence of a cloud AI with none of the exposure.' },
  { q: 'Which email providers work?', a: 'Gmail, Outlook / Microsoft 365, and your own custom email address all work. To spot replies, it quietly checks your inbox — only ever reading it, never changing anything.' },
  { q: 'How does billing work?', a: `${PRICE.amount}/week, everything included, cancel anytime. It starts with a ${PRICE.trialDays}-day trial.` },
]

export const FINAL = {
  title: 'Cleared for takeoff.',
  sub: 'Set up your outreach once and let your AI copilot write it, schedule it, and handle every follow-up — while you focus on the replies that matter.',
}

// Real app screenshots (captured into /public/shots by scripts/capture-shots.mjs).
export const SHOTS = [
  { src: 'shots/dashboard.png', label: 'Dashboard', caption: 'Pre-flight check, live usage, and today’s schedule at a glance.' },
  { src: 'shots/sequences.png', label: 'Sequences', caption: 'Reply-aware follow-up steps, built in minutes.' },
  { src: 'shots/recipients.png', label: 'Contacts', caption: 'Import, personalize, and schedule per contact.' },
  { src: 'shots/accounts.png', label: 'Accounts', caption: 'Keep several mailboxes organized in one place.' },
]

// --- Brand logo slot ---------------------------------------------------------
// Drop your asset at landing/public/logo.svg and set logoSrc to '/logo.svg'.
// While these are empty, <Logo> renders an animated wordmark fallback.
export const BRAND = {
  name: 'Email Pilots',
  logoSrc: '',      // e.g. '/logo.svg'
  logoDarkSrc: '',  // optional variant for dark backgrounds, e.g. '/logo-dark.svg'
}

// Current single plan, relabeled so Business & Teams reads as a future tier.
export const PLAN = {
  name: 'Solo',
  tagline: 'One person, your own mailbox.',
}

// HUD chapter metadata. ids match the section[id]s used for nav anchors.
export const CHAPTERS = [
  { id: 'top', code: '00', name: 'Preflight' },
  { id: 'how', code: '01', name: 'Flight plan' },
  { id: 'features', code: '02', name: 'The cockpit' },
  { id: 'landing', code: '03', name: 'Landing & reply' },
  { id: 'why', code: '04', name: 'Why fly with us' },
  { id: 'pricing', code: '05', name: 'Final approach' },
] as const

// --- Coming soon: Business & Teams (NOT yet available) -----------------------
export const COMING_SOON = {
  badge: 'Coming soon · not yet available',
  eyebrow: 'On the horizon',
  title: 'Built for Business & Teams.',
  sub: 'A longer-haul tier we’re charting now. Planned, not yet available — and we don’t promise dates. Leave your address and we’ll tell you when it boards.',
  summary: 'A shared team workspace, one-click sign-in, and simple analytics — planned, not yet available.',
  waitlistHref: 'mailto:hello@emailpilots.app?subject=Business%20%26%20Teams%20waitlist',
  waitlistLabel: 'Get notified when Business & Teams launches',
}
