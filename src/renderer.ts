import fs from 'fs';
import Mustache from 'mustache';
import { applyMergeDefaults } from './mergeDefaults';
import type { Config } from './config';

export interface RenderedEmail {
  subject: string;
  body: string;
  /** Plain-text alternative part (multipart/alternative). */
  text: string;
  /** Value for the List-Unsubscribe header, or undefined when disabled. */
  listUnsubscribe?: string;
}

/** Crude HTML → text for the plain-text alternative part. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Keep link targets so the plain-text unsubscribe link stays usable.
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
             (_m, href, txt) => `${String(txt).replace(/<[^>]+>/g, '').trim()} (${href})`)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Build the CAN-SPAM / unsubscribe footer appended to every email. */
function buildFooter(senderEmail: string, config: Config): { html: string; unsubscribe?: string } {
  // Primary-tab mode: no List-Unsubscribe value and no CAN-SPAM footer, so the
  // message reads as 1:1 mail. bulk mode keeps both (see config.inboxPlacement).
  if (config.sender.inboxPlacement === 'primary') return { html: '', unsubscribe: undefined };

  const parts: string[] = [];
  let unsubscribe: string | undefined;

  if (config.sender.unsubscribeEnabled && senderEmail) {
    unsubscribe = `mailto:${senderEmail}?subject=Unsubscribe`;
    parts.push(`To stop receiving these emails, <a href="${unsubscribe}">unsubscribe here</a>.`);
  }
  if (config.sender.physicalAddress) {
    parts.push(config.sender.physicalAddress.replace(/\n/g, ', '));
  }
  if (parts.length === 0) return { html: '', unsubscribe };

  const html =
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e5e5;` +
    `font-size:12px;color:#888;line-height:1.5;">${parts.join('<br>')}</div>`;
  return { html, unsubscribe };
}

const HTML_ENTITIES: { [k: string]: string } = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x2F;': '/',
  '&#x60;': '`',
  '&#x3D;': '=',
};

/** Subjects are plain text; undo Mustache's HTML escaping. */
function htmlUnescape(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|#x2F|#x60|#x3D);/g, m => HTML_ENTITIES[m] || m);
}

/**
 * Single source of truth for email rendering, shared by the batch send,
 * the scheduled send, and both preview paths so WYSIWYG holds.
 *
 * Model: the recipient's message (text or file) is injected into the
 * template.html wrapper at the {{{message}}} placeholder, then the whole
 * thing is rendered with Mustache against the record. Falls back to the
 * raw message when there is no wrapper template.
 *
 * Throws if a referenced message file is missing (callers that preview
 * should catch and surface the error).
 */
export function renderEmail(record: any, config: Config): RenderedEmail {
  // Resolve the per-recipient message body.
  let message = '';
  if (record.messageType === 'file' && record.messageContent) {
    if (!fs.existsSync(record.messageContent)) {
      throw new Error(`Message file not found at ${record.messageContent}`);
    }
    message = fs.readFileSync(record.messageContent, 'utf-8');
  } else if (record.messageType === 'text' && record.messageContent) {
    // Direct-Text messages are plain text but land inside an HTML template,
    // where raw newlines collapse to spaces — every multi-paragraph message
    // arrived as one run-on block (audit U20). Convert newlines to <br> for
    // this type only: 'file' messages are already HTML and stay untouched, and
    // untyped legacy records keep the old behavior. '<br>' with no trailing
    // '\n' so htmlToText()'s <br>→\n mapping round-trips the plain-text part
    // exactly (a trailing newline would double every break). Mustache tags are
    // skipped: a {{tag}} wrapped across a line break is valid Mustache, and a
    // <br> injected inside it would make the tag silently render as empty.
    message = String(record.messageContent)
      .split(/(\{\{\{[\s\S]*?\}\}\}|\{\{[\s\S]*?\}\})/)
      .map((seg, i) => (i % 2 ? seg : seg.replace(/\r\n|\r|\n/g, '<br>')))
      .join('');
  }

  // Resolve the recipient's campaign (if any) for per-campaign subject/template
  // defaults. An unknown/absent campaignId leaves `campaign` undefined → globals.
  const campaign = record.campaignId
    ? (config.campaigns || []).find(c => c.id === record.campaignId)
    : undefined;

  // Load the wrapper template (greeting/styling). An inline campaign template
  // wins over the on-disk global template.html.
  let template = '';
  if (campaign && typeof campaign.template === 'string' && campaign.template.trim()) {
    template = campaign.template;
  } else if (fs.existsSync(config.paths.templateHtml)) {
    template = fs.readFileSync(config.paths.templateHtml, 'utf-8');
  }

  // Compose: prefer wrapper+placeholder; fall back sensibly.
  let templateContent: string;
  if (template && template.includes('{{{message}}}')) {
    // split/join replaces EVERY placeholder (plain .replace does only the first)
    // and never interprets $-patterns in the message body.
    templateContent = template.split('{{{message}}}').join(message);
  } else if (template) {
    templateContent = template;
  } else {
    templateContent = message;
  }

  templateContent = applyMergeDefaults(templateContent, record);
  let rendered = Mustache.render(templateContent, record);

  // Primary-tab mode: strip <head> and <style> blocks so any template degrades
  // to a lean personal note (designed/styled HTML reads as bulk to Gmail).
  if (config.sender.inboxPlacement === 'primary') {
    rendered = rendered
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
  }

  // Append unsubscribe / physical-address footer (CAN-SPAM).
  const footer = buildFooter(config.smtp.user, config);
  if (footer.html) {
    rendered = rendered.includes('</body>')
      ? rendered.replace('</body>', `${footer.html}</body>`)
      : rendered + footer.html;
  }

  // Subject precedence: recipient's own subject > campaign default > global default.
  const subjectTpl = (record.subject && String(record.subject).trim())
    ? String(record.subject)
    : (campaign && campaign.subject && String(campaign.subject).trim())
      ? String(campaign.subject)
      : config.email.subject;
  const subject = htmlUnescape(Mustache.render(applyMergeDefaults(subjectTpl, record), record));
  const text = htmlToText(rendered);

  return { subject, body: rendered, text, listUnsubscribe: footer.unsubscribe };
}
