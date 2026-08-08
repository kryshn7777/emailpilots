// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import glsl from 'vite-plugin-glsl';

// site/base get set for GitHub Pages in the deploy phase.
// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [glsl({ minify: false })],
  },
});