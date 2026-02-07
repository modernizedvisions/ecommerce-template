import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    preserveSymlinks: true, // keep the mapped path (avoids '#' realpath issues on Windows)
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
