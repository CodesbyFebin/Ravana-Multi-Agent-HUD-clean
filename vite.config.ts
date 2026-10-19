import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // GitHub Pages project sites are served from a repository subpath.
    base: process.env.GITHUB_ACTIONS === 'true' ? '/Ravana-Multi-Agent-HUD-clean/' : '/',
    plugins: [react(), tailwindcss()],
    build: {
      // Keep stable, heavyweight dependencies in cacheable vendor chunks.
      // Vite 8 uses Rolldown's codeSplitting API instead of Rollup manualChunks.
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'vendor-icons',
                test: /node_modules[\\/]lucide-react[\\/]/,
                priority: 25,
              },
              {
                name: 'vendor-three',
                test: /node_modules[\\/]three[\\/]/,
                priority: 20,
              },
              {
                name: 'vendor-motion',
                test: /node_modules[\\/]motion[\\/]/,
                priority: 20,
              },
              {
                name: 'vendor-core',
                test: /node_modules[\\/]/,
                minSize: 20_000,
                priority: 10,
              },
            ],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR and file watching can be disabled in constrained development environments.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
