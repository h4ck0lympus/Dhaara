/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, modulePreload: { polyfill: false }, sourcemap: false },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
});
