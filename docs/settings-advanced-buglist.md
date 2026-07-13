# Settings Advanced-Disclosures — Bug List

Per-task findings for demoting the Email Template (HTML) editor and the Sending-style / Inbox-
placement block behind explained "Advanced" `<details>` disclosures, so beginners aren't confused.

Status legend: 🔍 OPEN · ✅ CONFIRMED · ❌ FALSE POSITIVE · 🔧 FIXED

---

## S1 — Email Template disclosure

**Scope:** `index.html` Email Content card — `#email-template` wrapped in
`<details class="adv-disclosure">` with summary + why/consequence copy. Default Subject stays
visible.

- **[S1-1] 🔧 FIXED — textarea lost its label.** Removing `<label for="email-template">` (the
  summary now serves as the visible label) left the textarea without a programmatic name. Added
  `aria-label="Email template (HTML)"`.
- **[S1-2] ✅ Field stays in DOM.** `#email-template` is inside the (collapsed) details, so the
  save handler (`inputTemplate.value`) still reads it; backend only writes the template when it's
  a string → round-trip safe.
- **[S1-3] ✅ Default-safe.** Blank template → message sent unwrapped; beginners can ignore it.

## S2 — Sending style disclosure

**Scope:** `index.html` Inbox-placement card — `#inbox-placement` + `#canspam-address-group` +
`#canspam-unsub-group` wrapped in `<details class="adv-disclosure">` with Personal/Bulk why +
consequences (Promotions tab, anti-spam law). Warm-up (`#warmup-enabled`) stays visible.

- **[S2-1] ✅ `applyPlacementVisibility` intact.** It toggles the address/unsub groups by id;
  they remain in the DOM nested in the details. Expand details → Bulk → groups show; Personal →
  hide. No JS change.
- **[S2-2] ✅ Nesting balanced.** Verified: card → details{ why + sending-style + address +
  unsub } → warm-up (outside) → card close. (index.html ~:834-876)
- **[S2-3] 🔍 Card-title redundancy.** The card heading "Inbox placement & legal footer" sits
  above a collapsed details whose summary restates "Sending style & legal footer". Minor; the
  summary makes the collapsed content discoverable. Acceptable.
- **[S2-4] ✅ Default-safe.** `#inbox-placement` default `primary`; collapsing doesn't change the
  saved value (partial save preserves it).

## S3 — CSS + rebuild

**Scope:** `.adv-disclosure` styles (mirror `.sw-why`: quiet muted summary, `▸` rotates on
`[open]`, no native marker). `tsc` clean; 107/107; build clean; `dist-vite` rebuilt (2 disclosures
in index.html, styles in CSS asset).

- **[S3-1] ✅ Glyph + marker.** `content:"\25B8"` + `::-webkit-details-marker{display:none}`
  (Electron = Chromium). Rotates on open.

---

# QA Phase — triage

All findings reproduced against markup + code paths. One real fix (S1-1, missing label) applied
in QA; the rest verified working / minor.

- **Real & fixed:** S1-1 (aria-label restored).
- **Verified working:** S1-2/3, S2-1/2/4, S3-1.
- **Minor/accepted:** S2-3 (card-title vs summary redundancy).
- **Regression:** `npm test` 107/107; `tsc` clean. No JS logic changed — save/load round-trip and
  `applyPlacementVisibility` rely on ids that remain in the DOM. Send/footer behaviour unchanged.

## Pending visual verification (GUI only)
Settings shows Subject + Warm-up by default; Template and Sending-style are collapsed behind
"Advanced" toggles with the why/consequence copy; expanding Sending-style → Bulk reveals
address/unsubscribe; Save → reload round-trips all values; light theme clean.