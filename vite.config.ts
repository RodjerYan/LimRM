import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    https: true, // Включаем HTTPS для локального сервера
    port: 3000 // Явно указываем порт для консистентности
  }
});
