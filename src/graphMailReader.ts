// Microsoft Graph Mail.Read helpers for the reply poller's 'graph' branch. Two
// thin fetch calls, no SDK, no deps. Mirrors what the IMAP path needs: a message
// list (sender + subject + time) and one message's raw MIME (for parseBounce).

const BASE = 'https://graph.microsoft.com/v1.0';
// ponytail: 5 pages × 50 = 250 msgs/sweep is plenty for a 15-min poll and a 7-day
// first run at personal-outreach volume. Log-and-stop above it (raise if you scale).
const MAX_PAGES = 5;

export interface GraphMsg { id: string; from: string; subject?: string; receivedDateTime: string; }

function graphGet(token: string, url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

/**
 * Inbox messages received at/after `sinceIso`. `ge` is inclusive, so the newest
 * message re-appears on the next sweep — harmless because recordReply/suppress are
 * idempotent (the IMAP path relies on the same "re-scan is safe" property).
 * ponytail: switch to `gt` + a sub-second cursor only if the redundant refetch matters.
 */
export async function listInboxSince(token: string, sinceIso: string): Promise<{ messages: GraphMsg[]; newestIso: string }> {
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const orderby = encodeURIComponent('receivedDateTime DESC');
  let url: string | null =
    `${BASE}/me/mailFolders/inbox/messages?$select=id,from,subject,receivedDateTime&$orderby=${orderby}&$filter=${filter}&$top=50`;
  const messages: GraphMsg[] = [];
  let newestMs = Date.parse(sinceIso) || 0;
  let newestIso = sinceIso;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await graphGet(token, url);
    if (!res.ok) throw new Error(`Graph list messages failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`);
    const body: any = await res.json();
    for (const m of body.value || []) {
      const iso = String(m.receivedDateTime || '');
      const ms = Date.parse(iso);
      if (ms && ms > newestMs) { newestMs = ms; newestIso = iso; }
      messages.push({ id: m.id, from: String(m.from?.emailAddress?.address || '').toLowerCase(), subject: m.subject, receivedDateTime: iso });
    }
    url = body['@odata.nextLink'] || null;
    if (url && page === MAX_PAGES - 1) console.warn('Graph inbox: more than MAX_PAGES of new mail in one sweep; remainder waits for the next poll.');
  }
  return { messages, newestIso };
}

/** Raw RFC822 MIME of one message (for parseBounce / classify). */
export async function getMimeSource(token: string, id: string): Promise<string> {
  const res = await graphGet(token, `${BASE}/me/messages/${encodeURIComponent(id)}/$value`);
  if (!res.ok) throw new Error(`Graph MIME fetch failed (${res.status}) for ${id}`);
  return res.text();
}
