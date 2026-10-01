/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Splits the large vendors into their own chunks. Vite's preload helper goes with React,
 * which the menu loads anyway; otherwise Rollup can place it inside the PixiJS chunk and
 * force the menu to download PixiJS, which should only load with the first match. PixiJS
 * alone is about 580 kB minified, hence the raised warning limit.
 */
function vendorChunk(id: string): string | undefined {
  if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'react'
  if (/node_modules\/(pixi\.js|@pixi|earcut|eventemitter3|parse-svg-path|tiny-lru|ismobilejs)\//.test(id)) return 'pixi'
  if (/node_modules\/(react|react-dom|scheduler|zustand|@tanstack)\//.test(id)) return 'react'
  return undefined
}

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'zustand',
      'zod',
      'pixi.js',
      'axios',
      '@tanstack/react-query',
      'msw/browser',
    ],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
