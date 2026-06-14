/**
 * Lightweight, dependency-free spam heuristics. Pure function so it runs both
 * in the renderer (preview warning) and the main process (pre-send). Advisory
 * only — never blocks a send, just warns the user before their reputation pays.
 */

export type SpamSeverity = 'high' | 'med' | 'low';

export interface SpamFinding {
  label: string;
  severity: SpamSeverity;
}

export interface SpamReport {
  score: number;
  level: 'clean' | 'warn' | 'risky';
  findings: SpamFinding[];
}

const SPAM_WORDS = [
  'free', 'guarantee', 'guaranteed', 'act now', 'limited time', 'winner',
  'congratulations', 'click here', 'buy now', 'order now', 'risk-free',
  'no obligation', '100%', 'cash', 'cheap', 'discount', 'earn money',
  'make money', 'income', 'viagra', 'crypto', 'investment', 'urgent',
  'apply now', 'exclusive deal', 'lowest price', 'this is not spam',
];

const WEIGHT: Record<SpamSeverity, number> = { high: 3, med: 2, low: 1 };

function stripTags(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
             .replace(/<script[\s\S]*?<\/script>/gi, ' ')
             .replace(/<[^>]+>/g, ' ')
             .replace(/&nbsp;/g, ' ')
             .replace(/\s+/g, ' ')
             .trim();
}

export function checkSpam(subject: string, html: string, hasPlainText: boolean): SpamReport {
  // Coerce up front: raw `subject`/`html` are used unguarded below (e.g. .match,
  // string concat), so an undefined arg would otherwise throw.
  subject = subject || '';
  html = html || '';
  const findings: SpamFinding[] = [];
  const text = stripTags(html);
  const lcSubject = (subject || '').toLowerCase();
  const lcText = text.toLowerCase();

  // Subject hygiene
  if (subject && subject.length > 0) {
    const letters = subject.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= 6 && subject === subject.toUpperCase()) {
      findings.push({ label: 'Subject is ALL CAPS', severity: 'high' });
    }
    if (subject.length > 70) findings.push({ label: 'Subject longer than 70 chars', severity: 'low' });
  } else {
    findings.push({ label: 'Empty subject', severity: 'med' });
  }

  // Excessive punctuation
  if ((subject.match(/!/g) || []).length >= 2 || (text.match(/!/g) || []).length >= 4) {
    findings.push({ label: 'Excessive exclamation marks', severity: 'med' });
  }
  if (/\$\$\$|\$\d{3,}/.test(subject + ' ' + text)) {
    findings.push({ label: 'Money/`$$$` patterns', severity: 'med' });
  }

  // Spam vocabulary
  const hits = SPAM_WORDS.filter(w => lcSubject.includes(w) || lcText.includes(w));
  if (hits.length >= 4) findings.push({ label: `Many spam-trigger words (${hits.slice(0, 4).join(', ')}…)`, severity: 'high' });
  else if (hits.length > 0) findings.push({ label: `Spam-trigger words (${hits.join(', ')})`, severity: 'med' });

  // Links (ignore mailto: — e.g. our own unsubscribe link isn't marketing spam)
  const linkCount = (html.match(/<a\s[^>]*href=["']?(?!mailto:)/gi) || []).length;
  if (linkCount > 8) findings.push({ label: `Too many links (${linkCount})`, severity: 'high' });
  else if (linkCount > 4) findings.push({ label: `High link count (${linkCount})`, severity: 'low' });

  // Image-heavy / thin text
  const imgCount = (html.match(/<img\s/gi) || []).length;
  if (imgCount > 0 && text.length < 80) {
    findings.push({ label: 'Image-only / very little text', severity: 'high' });
  }
  if (text.length < 20) findings.push({ label: 'Almost no body text', severity: 'med' });

  // Missing plaintext alternative
  if (!hasPlainText) findings.push({ label: 'No plain-text alternative part', severity: 'low' });

  const score = findings.reduce((s, f) => s + WEIGHT[f.severity], 0);
  const level: SpamReport['level'] = score >= 6 ? 'risky' : score >= 3 ? 'warn' : 'clean';
  return { score, level, findings };
}
