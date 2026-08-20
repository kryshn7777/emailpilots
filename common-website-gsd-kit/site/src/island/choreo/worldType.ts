/**
 * Every string that is rendered *in the world* rather than in the DOM — D3-07's label
 * source. Transcribed verbatim from `docs/direction/STORYBOARD.md`; `copyParity.test.ts`
 * pins each array against the storyboard's own wording.
 *
 * `labels.ts` (03-07) bakes exactly these strings onto canvas textures and nothing else,
 * and Phase 4's mobile cut — which renders the same tags as DOM captions, because tiny
 * world text loses to a small screen — reads the same arrays. One source, two paths.
 *
 * Zero imports: this is data, and it must stay drivable from `node --test`.
 */

/**
 * Ch2 — the printed paper tags that stamp onto the stack as it assembles, lying flat on
 * the desk in IBM Plex Mono small caps. Separator is a middle dot, not a hyphen.
 * STORYBOARD Ch2 §Animation.
 */
export const WAIT_TAGS = ['FOLLOW-UP 2 · wait 3 days', 'FOLLOW-UP 3 · wait 4 days'] as const;

/**
 * Ch3 — the constellation timestamps: typography as the *data* of the story, send times
 * made physical. Deliberately wobbled off the hour; the irregularity is the claim
 * ("Never at 9:00:00 sharp", FEATURES §5). STORYBOARD Ch3 §On-screen copy.
 */
export const SEND_TIMESTAMPS = ['9:14 pm', '9:41 pm', '10:07 pm'] as const;

/**
 * Ch4 — the paper day-tag as it flips through the wheel. MON is Ch1-Ch3; TUE..SAT flip
 * inside Ch4, at midnight rather than at dawn (STORYBOARD Amendment A6), which is what
 * lets the chapter show six days while exiting before dawn 6.
 */
export const DAY_TAGS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/**
 * Ch6 — the five leader-line label ends, in the order the lines land (22-50%, one at a
 * time, each with its object re-light). They name the app's own UI, mapped from the world
 * object the visitor just watched: constellation, envelope stack, drawer, clock, and the
 * lamp-lit meter zone. STORYBOARD Ch6 §Visual composition.
 */
export const MAP_LABELS = [
  '7-day plan',
  'Sequences',
  'Do-not-send list',
  'schedule times',
  "Today's Usage",
] as const;
