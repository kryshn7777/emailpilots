import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // node-llama-cpp is a native, ESM-only module loaded at runtime via a
              // bundler-opaque dynamic import in src/ai/providers/localLlama.ts. Keep it
              // (and its per-platform binary subpackages) external so the bundler never
              // tries to inline the native addon; it resolves from unpacked node_modules.
              // mailparser is external too: it's lazy-imported in replyPoller for reply
              // classification — leaving it external avoids code-splitting the main entry
              // (it resolves via require() from node_modules; pure JS, no asarUnpack needed).
              external: ['node-llama-cpp', /^@node-llama-cpp\//, 'mailparser'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
      },
    ]),
  ],
  server: {
    watch: {
      // The Electron main process rewrites .env (saveConfigToEnv) and flat JSON
      // state files at runtime. Ignore them so a config save / poll / send doesn't
      // restart the Vite dev server and relaunch the app mid-use. Dev-only — the
      // packaged app has no watcher.
      ignored: [
        '**/.env',
        '**/recipients.json',
        '**/accounts.json',
        '**/replies.json',
        '**/stats.json',
        '**/suppression.json',
        '**/campaigns.json',
        '**/sequences.json',
        '**/scheduler.json',
        '**/limits*.json',
        '**/imap.*.json',
      ],
    },
  },
  build: {
    outDir: 'dist-vite',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});
