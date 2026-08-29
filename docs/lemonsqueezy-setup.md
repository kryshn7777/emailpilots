# Lemon Squeezy setup — Email Pilots First Class

Sub-project **#2** of the Rev 2 freemium plan. Owner: **you** (dashboard work, not code).
Outcome: a live product with two subscription variants, license keys enabled, and a
checkout URL to paste into `landing/src/config.ts`.

Enforcement model (already ratified): **License API only, no backend, no webhooks.**
Lemon Squeezy is merchant of record — it collects and remits VAT/sales tax for you.

---

## 0. Before you start

| Need | Why |
|------|-----|
| Business/personal identity docs | LS verifies before payouts |
| Bank account or PayPal | payout destination |
| Live terms + privacy URLs | LS requires them on the store; you have `docs/terms-and-conditions.md` + `docs/privacy-policy.md` published on the landing site |
| Support email | shown on receipts |

**Do every step below in Test mode first.** The toggle is top-right of the LS dashboard.
Test-mode objects are separate from live ones — you will create the product twice, or
flip the store live and re-create. Plan on re-creating.

---

## 1. Store

1. Sign up at lemonsqueezy.com → create store.
2. Store name: `Email Pilots` (appears on the card statement — keep it recognizable or
   customers file chargebacks).
3. Store URL slug: `emailpilots` → checkout lives at `https://emailpilots.lemonsqueezy.com`.
4. Settings → currency `USD`. Cannot be changed after first sale.
5. Settings → Store → add support email, terms URL, privacy URL, logo.
6. Settings → Payouts → connect bank/PayPal, complete identity verification.
   Verification can take days — start it now, it does not block test-mode work.

**Positioning guard:** the product description you type here is customer-facing and is
read by LS risk review. Describe it as *personal outreach and follow-up from your own
mailbox*. Never write "cold email", "bulk", "mass mail", or "anti-ban" — that phrasing
is what gets payment accounts terminated.

---

## 2. Product

Products → New product.

- **Name:** `Email Pilots — First Class`
- **Description:** short, benefit-first, ToS-safe (see guard above).
- **Pricing model:** Subscription.
- **Tax category:** Software as a Service (SaaS) — it is licensed software with a
  recurring term; do not pick "digital goods".

Leave "Free trial" **off** on both variants. The free time is app-side and needs no card:
first run before 2026-11-22 grants 30 days, after it 7 days
(`FOUNDER_FREE_DAYS` / `TRIAL_FREE_DAYS` in `src/licensing/entitlement.ts`, stamped by
`grantSignupTrial()` and enforced at `SequenceRunner.tick()`). LS has no way to observe an
install, so an LS-side trial would double-count and let someone burn the trial without
ever installing.

---

## 3. Variants

Two variants under that one product:

| Variant name | Interval | Price |
|---|---|---|
| `Weekly` | every 1 week | `$2.90` |
| `Monthly` | every 1 month | `$10.00` |

The "Save 20%" badge is landing-page copy, not an LS field.

Record both **variant IDs** — visible in the variant URL and in the API — and each
variant's own **buy URL** (Product → Share). Both halves go into `LS_PLANS` in
`src/licensing/lsConfig.ts`, which is the only place in the desktop app that knows what
the plans are called or cost:

```ts
export const LS_STORE_ID = 123456;
export const LS_PLANS: LsPlan[] = [
  { variantId: 654321, name: 'Weekly',  price: '$2.90',  interval: 'week',  buyUrl: 'https://emailpilots.lemonsqueezy.com/buy/<weekly-uuid>' },
  { variantId: 654322, name: 'Monthly', price: '$10.00', interval: 'month', buyUrl: 'https://emailpilots.lemonsqueezy.com/buy/<monthly-uuid>' },
];
```

The variant ids are the guard that rejects a license minted for some other product;
`LS_VARIANT_IDS` is derived from this table, so there is nothing else to keep in sync. The
buy URLs power the in-app Weekly/Monthly upgrade buttons (Settings → Plan & License),
which open in the default browser and only render once a URL is non-empty. The `price`
strings are display-only — Lemon Squeezy is what actually charges — but a stale one
misleads a customer at the moment they decide to pay.

---

## 4. License keys (the whole point)

Per variant → **Generate license keys for this variant: ON**.

- **Activation limit:** `3`. One person, laptop + desktop + a reinstall. `1` generates
  support tickets on every machine change; unlimited invites sharing.
- **License length / expiry:** *follow the subscription*. The key must expire when the
  subscription lapses, otherwise a cancelled customer keeps First Class forever.

Repeat for the second variant — the setting is per variant, not per product.

---

## 5. Checkout link

Product → Share → copy the buy link:

```
https://emailpilots.lemonsqueezy.com/buy/<uuid>
```

Paste into `landing/src/config.ts`:

```ts
export const CHECKOUT_URL = 'https://emailpilots.lemonsqueezy.com/buy/<uuid>'
```

Useful query params:

- `?embed=1` — overlay checkout instead of a redirect (needs the LS `lemon.js` script on
  the page; plain redirect is fine and one less dependency).
- `?checkout[email]=…` — prefill.
- `?checkout[custom][install_id]=…` — arbitrary data echoed back in the license record.
  Only worth it if you later want to auto-bind a key to an install.
- `&discount=0` — hide the discount field.

Settings → Checkout: set the post-purchase redirect to a landing page that shows the
license key and says "paste this into Email Pilots → Settings → License". The key is
also emailed automatically.

---

## 6. Webhooks

**Skip.** Webhooks need a public HTTPS endpoint; the plan is explicitly backend-free.
The License API alone tells the app everything it needs at validation time.

---

## 7. What the app calls

Three endpoints. All are `POST`, form-encoded, `Accept: application/json`, and
**unauthenticated** — no API key, which is exactly why this works from a desktop app.

```
POST https://api.lemonsqueezy.com/v1/licenses/activate
     license_key, instance_name           → returns instance.id
POST https://api.lemonsqueezy.com/v1/licenses/validate
     license_key, instance_id             → returns valid, license_key.status, meta
POST https://api.lemonsqueezy.com/v1/licenses/deactivate
     license_key, instance_id             → frees an activation slot
```

Smoke-test with a test-mode key before writing any code:

```bash
curl -X POST https://api.lemonsqueezy.com/v1/licenses/activate \
  -H 'Accept: application/json' \
  -d 'license_key=YOUR-TEST-KEY' \
  -d 'instance_name=devbox'
```

Response shape that matters:

```json
{
  "activated": true,
  "license_key": { "status": "active", "expires_at": null, "activation_usage": 1 },
  "instance": { "id": "…", "name": "devbox" },
  "meta": { "store_id": 1, "product_id": 2, "variant_id": 3 }
}
```

Wiring rules (these are the parts that go wrong):

1. **Store `instance.id`** next to the key. Validate needs it; without it you can only do
   a weak key-exists check.
2. **Check `meta.store_id` and `meta.variant_id`** against your own IDs. A key from any
   other Lemon Squeezy store validates fine otherwise — anyone could buy a $1 product
   somewhere else and unlock First Class.
3. **`status` is the truth**, not `valid` alone. `expired`, `disabled`, `inactive` all
   mean lock it.
4. **Grace on network failure only.** Request threw / timed out / 5xx → keep the last
   cached verdict. A clean response saying `expired` gets **no grace**. This is the plan's
   ratified rule and the difference between resilience and a free tier.
5. **Deactivate on sign-out**, or the customer burns all 3 slots reinstalling.
6. **Downgrades apply at scheduling boundaries**, never mid-batch.
7. Free tier makes **zero** network calls. First license call ships in the same PR as the
   privacy-policy amendment.

**Never ship the Lemon Squeezy API key.** The `Bearer` API key (Settings → API) is for
the admin REST API — listing orders, refunds, subscriptions. It is a full account
credential. It has no place in a desktop binary, an env file that gets packaged, or the
renderer. The three license endpoints above need none of it.

---

## 8. Go live

1. Flip the dashboard out of Test mode.
2. Re-create product + variants + license settings (test-mode objects do not carry over).
3. Copy the **live** buy link into `landing/src/config.ts` — the test link 404s in live mode.
4. Buy it yourself with a real card. Confirm: email arrives, key activates, validate
   returns `active`, `meta.variant_id` matches.
5. Refund yourself. Confirm the key flips to `disabled`/`expired` and the app locks at the
   next boundary.
6. Cancel-flow check: cancel the subscription, confirm access survives to period end and
   dies after.

---

## Checklist

- [ ] Store created, currency USD, identity + payout submitted
- [ ] Terms / privacy / support email set on store
- [ ] Product created, tax category SaaS, ToS-safe description
- [ ] Weekly $2.90 variant
- [ ] Monthly $10.00 variant
- [ ] License keys ON for both, activation limit 3, expiry follows subscription
- [ ] Store ID + both variant IDs + both buy URLs pasted into `src/licensing/lsConfig.ts` (`LS_STORE_ID`, `LS_PLANS`)
- [ ] Buy link in `landing/src/config.ts` (`CHECKOUT_URL`)
- [ ] Post-purchase redirect page explaining where to paste the key
- [ ] `curl` activate/validate/deactivate verified against a test key
- [ ] Live-mode re-create + real purchase + refund verified
