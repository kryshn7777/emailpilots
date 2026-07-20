import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// GitHub Pages serves a project site from /Emailpilots3/; local dev/build from /.
const base = process.env.GITHUB_ACTIONS ? '/Emailpilots3/' : '/'

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
