import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';

/**
 * Que build e esta, em oito caracteres.
 *
 * Sem isto, "a app nao atualizou" e uma discussao sem arbitro: eu vejo uma
 * coisa no meu ecra, quem tem a app instalada ve outra, e nenhum dos dois
 * consegue provar qual das duas esta a correr. Com o commit a vista no ecra do
 * perfil, a pergunta responde-se em dois segundos.
 *
 * Fora de um repositorio — um tarball, por exemplo — fica a data, que ja diz
 * o suficiente.
 */
function buildId(): string {
  try {
    return execSync('git rev-parse --short=8 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default defineConfig({
  plugins: [react()],

  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },

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