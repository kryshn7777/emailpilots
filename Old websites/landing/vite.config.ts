import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// GitHub Pages serves a project site from /Emailpilots3/; local dev/build from /.
// PAGES_BASE overrides both, for the combined deploy in the emailpilots repo
// that publishes this site at the root and the flight site under /flight/.
// deploy-landing.yml does not set it, so that workflow is unaffected.
const base = process.env.PAGES_BASE || (process.env.GITHUB_ACTIONS ? '/Emailpilots3/' : '/')

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Multi-page: index.html is the scroll story; the rest are standalone
      // documents that mount no Hud/Story/Lenis and pull no three/gsap. Mirrors
      // the desktop app's own vite.config.ts (input: { main, gui2 }).
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
        install: resolve(__dirname, 'install.html'),
        appPasswords: resolve(__dirname, 'app-passwords.html'),
      },
    },
  },
})
