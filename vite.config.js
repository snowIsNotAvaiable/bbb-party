import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Alles lokal: keine CDN-Referenzen, kleine Chunks für schnelles Laden im WLAN
    assetsInlineLimit: 4096,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/api': { target: 'http://localhost:3000' },
      // Der Spickzettel wird vom Server gerendert, nicht vom Client gebaut.
      '/spickzettel': { target: 'http://localhost:3000' },
      '/rueckblick': { target: 'http://localhost:3000' },
    },
  },
});
