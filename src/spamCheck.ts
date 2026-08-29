/**
 * Lightweight, dependency-free spam heuristics. Pure function so it runs both
 * in the renderer (preview warning) and the main process (pre-send). Advisory
 * only — never blocks a send, just warns the user before their reputation pays.
 */

export type SpamSeverity = 'high' | 'med' | 'low';

/** The five things this file actually examines. Every finding belongs to exactly
 *  one, so the UI can report what was *checked* rather than only what was wrong —
 *  "nothing stood out" is worthless if you can't tell what was looked at. */
export type SpamCategory = 'subject' | 'wording' | 'links' | 'content' | 'format';

export interface SpamFinding {
  label: string;
  severity: SpamSeverity;
  /** Required, not optional: the compiler is what guarantees a new rule can't be
   *  added without a home, and so silently vanish from the report card. */
  category: SpamCategory;
}

export interface SpamReport {
  score: number;
  level: 'clean' | 'warn' | 'risky';
  findings: SpamFinding[];
}

/** The rule levels and the AI advisor's levels are two vocabularies for the same
 *  three states. Callers map either through {@link spamVerdict}. */
export type VerdictLevel = SpamReport['level'] | 'low' | 'medium' | 'high';

/**
 * Plain-language verdict for a level. Lives here, next to the levels themselves,
 * so the Deliverability screen and the send-preview banner cannot drift into
 * describing the same email differently — and so it is testable without a DOM.
 *
 * Deliberately returns no number: a score is meaningful to whoever tuned the
 * weights and to nobody else.
 */
export function spamVerdict(level: VerdictLevel): { text: string; color: string } {
  switch (level) {
    case 'risky':
    case 'high':
      return { text: '✕ Likely to hit spam', color: '#dc2626' };
    case 'warn':
    case 'medium':
      return { text: '⚠ Might get filtered', color: '#d97706' };
    default:
      return { text: '✓ Likely to reach the inbox', color: '#16a34a' };
  }
}

const SEVERITY_ORDER: Record<SpamSeverity, number> = { high: 0, med: 1, low: 2 };

/**
 * Findings worst-first, so the most worthwhile fix is read first. Copies before
 * sorting — `checkSpam`'s result is shared with the main process and must not be
 * reordered under a caller that is still holding it.
 */
export function sortedFindings(findings: readonly SpamFinding[]): SpamFinding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

const SPAM_WORDS = [
  'free', 'guarantee', 'guaranteed', 'act now', 'limited time', 'winner',
  'congratulations', 'click here', 'buy now', 'order now', 'risk-free',
  'no obligation', '100%', 'cash', 'cheap', 'discount', 'earn money',
  'make money', 'income', 'viagra', 'crypto', 'investment', 'urgent',
  'apply now', 'exclusive deal', 'lowest price', 'this is not spam',
];

/** DLV-16: whole words only. A plain substring test flagged "freelance",
 *  "incoming" and "Cashman" — an advisory that cries wolf gets ignored. Lookarounds
 *  rather than \b because entries like "100%" end in a non-word character. */
const SPAM_WORD_RES = SPAM_WORDS.map(w =>
  new RegExp(`(?<![a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i'));

/** DLV-18: subjects that say nothing about the message. "Hello" / "Hi" / "Test" sit
 *  under more spam than any specific line ever will, so a content filter reads the
 *  bare greeting itself as a similarity signal — the live report that added this
 *  rule ("Hello" / "Hi cutie" → Gmail spam, "similar to messages identified as spam
 *  in the past") was rated clean here. Compared after lower-casing, collapsing
 *  whitespace and dropping trailing punctuation, so "Hello!" and "Hi there." match
 *  while "Hello from the Acme design team" does not. */
const GENERIC_SUBJECTS = new Set([
  'hello', 'hi', 'hey', 'hi there', 'hello there', 'hey there', 'greetings',
  'good morning', 'good afternoon', 'good evening',
  'test', 'testing', 'test email', 'test mail', 'test message',
  'important', 'info', 'information', 'update', 'question', 'quick question',
  'checking in', 'touching base', 'no subject', '(no subject)',
]);

function isGenericSubject(subject: string): boolean {
  const key = subject.toLowerCase().replace(/\s+/g, ' ').replace(/[\s!?.,:;-]+$/, '').trim();
  return GENERIC_SUBJECTS.has(key);
}

const WEIGHT: Record<SpamSeverity, number> = { high: 3, med: 2, low: 1 };

/** DLV-6: generic URL shorteners. Receivers score them because the destination is
 *  hidden; in a personal note a full address also simply reads more honest. */
const SHORTENER_HOSTS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly',
  'rb.gy', 'tiny.cc', 'shorturl.at', 'rebrand.ly', 'bl.ink', 't.ly', 'shorte.st', 'adf.ly',
]);

/** Lower-cased hostname of a URL without a leading "www.", or '' when unparsable. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Same site when equal or one is a subdomain of the other (acme.com ~ mail.acme.com). */
function sameSite(a: string, b: string): boolean {
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
}

function stripTags(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
             .replace(/<script[\s\S]*?<\/script>/gi, ' ')
             .replace(/<[^>]+>/g, ' ')
             .replace(/&nbsp;/g, ' ')
             .replace(/\s+/g, ' ')
             .trim();
}

/**
 * The email's words, for a human to read — `<!DOCTYPE>`, `<style>` blocks and CSS
 * are not something a non-technical user should be made to look at just to check
 * their own email.
 *
 * Distinct from {@link stripTags}, which flattens everything to one line because
 * the heuristics only ever scan it. Here the paragraph breaks are the whole point:
 * a wall of one-line text is barely more readable than the markup it replaced.
 *
 * Display only — never feed this to `checkSpam`. The link and image rules read the
 * tags this deliberately throws away, so analysis must keep using the real HTML.
 */
export function htmlToReadableText(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<!DOCTYPE[^>]*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    // Entities last: an escaped &lt;b&gt; is literal text the user typed, so it
    // must not be decoded before tag-stripping or it would be stripped as markup.
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** SIM-4: cap on how much of the body the advisory scan reads. checkSpam runs
 *  per-recipient on the send path; its signals (all-caps subject, punctuation,
 *  spam vocabulary, links, images) all sit in a normal-length message, so a
 *  bounded prefix loses nothing meaningful while a multi-MB pasted body can't
 *  turn an advisory check into tens of seconds of main-process CPU over a batch.
 *  Mirrors bounceParser's MAX_BODY rationale. */
const MAX_SCAN_CHARS = 200 * 1024;

export function checkSpam(subject: string, html: string, hasPlainText: boolean): SpamReport {
  // Coerce up front: raw `subject`/`html` are used unguarded below (e.g. .match,
  // string concat), so an undefined arg would otherwise throw.
  subject = String(subject || '').slice(0, MAX_SCAN_CHARS);
  html = String(html || '').slice(0, MAX_SCAN_CHARS);
  const findings: SpamFinding[] = [];
  const text = stripTags(html);
  const lcSubject = (subject || '').toLowerCase();
  const lcText = text.toLowerCase();

  // Subject hygiene
  if (subject && subject.length > 0) {
    const letters = subject.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= 6 && subject === subject.toUpperCase()) {
      findings.push({ label: 'Your subject is in all capitals — this looks like shouting to spam filters', severity: 'high', category: 'subject' });
    }
    if (subject.length > 70) findings.push({ label: 'Your subject is long — it may get cut off on phones', severity: 'low', category: 'subject' });
    if (isGenericSubject(subject)) {
      findings.push({ label: `A subject like "${subject.trim()}" is what most spam uses — say what the email is about`, severity: 'med', category: 'subject' });
    }
  } else {
    findings.push({ label: 'Your subject line is empty', severity: 'med', category: 'subject' });
  }

  // Excessive punctuation
  if ((subject.match(/!/g) || []).length >= 2 || (text.match(/!/g) || []).length >= 4) {
    findings.push({ label: 'Lots of exclamation marks — try using one, or none', severity: 'med', category: 'wording' });
  }
  if (/\$\$\$|\$\d{3,}/.test(subject + ' ' + text)) {
    findings.push({ label: 'Dollar amounts written like "$$$" are a common spam signal', severity: 'med', category: 'wording' });
  }

  // Spam vocabulary
  const hits = SPAM_WORDS.filter((_w, i) => SPAM_WORD_RES[i].test(lcSubject) || SPAM_WORD_RES[i].test(lcText));
  if (hits.length >= 4) findings.push({ label: `Several words spam filters watch for: ${hits.slice(0, 4).join(', ')}…`, severity: 'high', category: 'wording' });
  else if (hits.length > 0) findings.push({ label: `Words spam filters watch for: ${hits.join(', ')}`, severity: 'med', category: 'wording' });

  // Links (ignore mailto: — e.g. our own unsubscribe link isn't marketing spam).
  // The quote must be matched explicitly per-branch: an optional `["']?` can
  // backtrack to empty, leaving the lookahead to inspect the quote character
  // rather than the scheme, which let every quoted mailto: through.
  const linkCount = (html.match(/<a\s[^>]*?href=(?:"(?!mailto:)|'(?!mailto:)|(?!["'])(?!mailto:))/gi) || []).length;
  if (linkCount > 8) findings.push({ label: `${linkCount} links is a lot — fewer links look more personal`, severity: 'high', category: 'links' });
  else if (linkCount > 4) findings.push({ label: `${linkCount} links — consider trimming to one or two`, severity: 'low', category: 'links' });

  // DLV-6: phishing-shaped links. Bounded quantifiers + a per-anchor cap keep this
  // linear on the 200 KB scan prefix (the link-count rule above already flags
  // link-heavy mail, so nothing is lost by stopping early).
  let shortener = false;
  let mismatch = false;
  let bareIp = false;
  let seen = 0;
  for (const m of html.matchAll(/<a\s[^>]*?href=["']?(https?:\/\/[^"'\s>]{1,500})["']?[^>]*>([^<]{0,300})/gi)) {
    if (++seen > 200) break;
    const hrefHost = hostOf(m[1]);
    if (!hrefHost) continue;
    if (SHORTENER_HOSTS.has(hrefHost)) shortener = true;
    // DLV-16: a numeric host has no domain reputation to check — phishing kits use
    // them because they are throwaway, so filters score the shape itself.
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hrefHost)) bareIp = true;
    // Anchor text that itself reads as a web address ("acme.com/deck",
    // "https://acme.com") but opens a different site is the classic phishing shape;
    // ordinary words as link text never trigger this.
    const bare = m[2].trim().replace(/^https?:\/\//i, '');
    if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#]|$)/i.test(bare)) {
      const textHost = hostOf(`http://${bare}`);
      if (textHost && !sameSite(textHost, hrefHost)) mismatch = true;
    }
  }
  if (mismatch) findings.push({ label: "A link's text shows a different address than it actually opens — filters read this as phishing", severity: 'high', category: 'links' });
  if (bareIp) findings.push({ label: 'A link points at a bare IP address instead of a domain — a classic phishing shape', severity: 'high', category: 'links' });
  if (shortener) findings.push({ label: 'A shortened link (bit.ly-style) hides where it goes — use the full address', severity: 'med', category: 'links' });

  // Image-heavy / thin text
  const imgCount = (html.match(/<img\s/gi) || []).length;
  if (imgCount > 0 && text.length < 80) {
    findings.push({ label: 'Almost all image, barely any text — filters distrust this', severity: 'high', category: 'content' });
  }
  if (text.length < 20) findings.push({ label: 'The email is nearly empty', severity: 'med', category: 'content' });

  // Missing plaintext alternative
  if (!hasPlainText) findings.push({ label: 'No plain-text version — some mail apps show a blank message', severity: 'low', category: 'format' });

  const score = findings.reduce((s, f) => s + WEIGHT[f.severity], 0);
  const level: SpamReport['level'] = score >= 6 ? 'risky' : score >= 3 ? 'warn' : 'clean';
  return { score, level, findings };
}
