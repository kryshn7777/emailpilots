// D2-06: env-driven site/base — CI sets SITE_BASE=/MailAutomation/, local dev runs at '/'.
// No code change needed for either root; see 02-RESEARCH.md Pattern 1.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_ORIGIN ?? 'https://kryshn7777.github.io',
  base: process.env.SITE_BASE ?? '/',
  trailingSlash: 'ignore',
});
