import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: 'frontend', plugins: [react()], base: './', build: { outDir: '../dist', emptyOutDir: true,rollupOptions:{input:{app:'frontend/index.html',companion:'frontend/companion.html'}} } });
