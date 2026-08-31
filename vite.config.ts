import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],

  // Relative asset URLs. Capacitor serves the bundle from capacitor://localhost
  // (iOS) and https://localhost (Android); an absolute "/assets/..." base
  // resolves against the wrong root inside the native WebView.
  base: './',

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  build: {
    // Capacitor copies this directory into the native projects.
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },

  server: {
    port: 5173,
    // Reachable from a phone on the same network, and from a device running
    // a Capacitor live-reload build.
    host: true,
  },

  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
