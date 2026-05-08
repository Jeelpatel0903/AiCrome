import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-extension-assets',
      writeBundle() {
        const distDir = resolve(__dirname, 'dist');

        // Copy manifest.json
        fs.copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(distDir, 'manifest.json'),
        );
        console.log('Copied manifest.json to dist/');

        // Move nested HTML files to dist root so the manifest can find them
        // Vite outputs HTML at dist/src/popup/index.html → rename to dist/popup.html
        const htmlMappings: Array<[string, string]> = [
          [path.join(distDir, 'src', 'popup', 'index.html'), path.join(distDir, 'popup.html')],
          [path.join(distDir, 'src', 'sidepanel', 'index.html'), path.join(distDir, 'sidepanel.html')],
        ];
        for (const [src, dest] of htmlMappings) {
          if (fs.existsSync(src)) {
            fs.renameSync(src, dest);
            console.log(`Moved ${path.relative(distDir, src)} → ${path.relative(distDir, dest)}`);
          }
        }

        // Remove empty nested dirs
        try { fs.rmdirSync(path.join(distDir, 'src', 'popup')); } catch { /* ignore */ }
        try { fs.rmdirSync(path.join(distDir, 'src', 'sidepanel')); } catch { /* ignore */ }
        try { fs.rmdirSync(path.join(distDir, 'src')); } catch { /* ignore */ }
      },
    },
  ],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background' || chunkInfo.name === 'content') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@devflow/shared': resolve(__dirname, '../shared/src'),
    },
  },
});
