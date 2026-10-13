import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `vite --mode https` enables a self-signed dev certificate (see ADR-015).
// A self-signed cert is enough for desktop/LAN GPS tests on some browsers, but a
// phone will usually NOT register a service worker against it. Use a real HTTPS
// deployment or tunnel for installation tests (see README / NEXT_STEPS).
export default defineConfig(({ mode }) => ({
  // Relative base so the app works from any sub-path (ADR-008).
  base: './',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // The manifest is hand-written in public/manifest.webmanifest (single source).
      manifest: false,
      // Registration (with visible update UX) is implemented in chunk 5.
      injectRegister: false,
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,geojson}'],
      },
      devOptions: { enabled: false },
    }),
    ...(mode === 'https' ? [basicSsl()] : []),
  ],
  build: { target: 'es2020', sourcemap: true },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
}));
