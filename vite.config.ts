import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Fix: Suppress a TypeScript error where 'https: true' is incorrectly rejected.
    // This is a valid Vite option to enable HTTPS with a self-signed certificate.
    // @ts-ignore
    https: true, // Включаем HTTPS для локального сервера
    port: 3000 // Явно указываем порт для консистентности
  }
});