import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // This proxy is useful for local development to avoid CORS issues
    // when the frontend (on Vite's dev server) calls the backend API
    // (Vercel serverless functions running on a different port).
    proxy: {
      '/api': {
        // The target should be the URL where your Vercel functions are running locally.
        // `vercel dev` typically runs on port 3000.
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
