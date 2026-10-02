import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The 5 s default failed specs whose first lazy import (mailparser) is cold
    // under full-suite load. Specs with their own timeout keep it.
    testTimeout: 20_000,
  },
});
