// D2-06: env-driven site/base — CI sets SITE_BASE=/MailAutomation/, local dev runs at '/'.
// No code change needed for either root; see 02-RESEARCH.md Pattern 1.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_ORIGIN ?? 'https://kryshn7777.github.io',
  base: process.env.SITE_BASE ?? '/',
  trailingSlash: 'ignore',
  build: {
    // Keep shell CSS as a real dist/_astro/*.css file (cacheable; and the budget/acceptance
    // checks grep it). Default 'auto' would inline small sheets into the HTML.
    inlineStylesheets: 'never',
  },
});
