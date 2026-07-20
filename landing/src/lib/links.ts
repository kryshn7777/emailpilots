/**
 * Base-path-safe internal links.
 *
 * Why this exists: the site is served from `/` in dev and from `/Emailpilots3/`
 * on GitHub Pages (see vite.config.ts). A root-absolute `href="/privacy"` looks
 * correct, works perfectly in local dev, and 404s only in production — it
 * resolves against the domain root, outside the project site entirely. The
 * Footer's Privacy/Terms links shipped that way and have been dead ever since.
 *
 * The trap is that root-absolute refs are NOT uniformly broken: Vite rewrites
 * them inside .html at build time (index.html's `/favicon.svg` is fine), but it
 * never touches hrefs inside JSX. Same-looking path, opposite outcome. So JSX
 * links must go through here.
 *
 * BASE_URL is always trailing-slashed ('/' or '/Emailpilots3/'), so these
 * concatenate directly.
 */
const B = import.meta.env.BASE_URL;

/** Link to the scroll-story home page, optionally to a section: homeHref('#pricing'). */
export function homeHref(hash = ''): string {
  return `${B}${hash}`;
}

/** Link to a standalone page by entry name: pageHref('privacy') -> '/Emailpilots3/privacy.html'. */
export function pageHref(name: string): string {
  return `${B}${name}.html`;
}
