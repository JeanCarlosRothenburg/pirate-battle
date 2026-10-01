/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Pre-bundle every runtime dependency at startup. Discovering one on first page load
  // makes Vite re-optimise and reload mid-session, which briefly loads two copies of React.
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
  build: { target: 'es2022', sourcemap: true },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
