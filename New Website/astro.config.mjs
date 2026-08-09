// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import swup from '@swup/astro';
import glsl from 'vite-plugin-glsl';

// site/base get set for GitHub Pages in the deploy phase.
// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    // Swup is the ONLY router (Astro <ClientRouter/> must stay off). It swaps
    // #swup only — the WebGL canvas lives outside it and survives navigation.
    swup({
      containers: ['#swup'],
      theme: false,
      smoothScrolling: false, // Lenis owns scrolling
      progress: false,
      accessibility: true,
      globalInstance: true, // SwupChoreo hooks in via window.swup
    }),
  ],
  vite: {
    plugins: [glsl({ minify: false })],
  },
});