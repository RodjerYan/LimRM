import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // @ts-ignore - Vite supports `https: true` for self-signed certificates, but TS types may not reflect this.
    https: true, // Включаем HTTPS для локального сервера
    port: 3000 // Явно указываем порт для консистентности
  }
});
