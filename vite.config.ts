import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/battleship-game/' : '/',
  test: { environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
