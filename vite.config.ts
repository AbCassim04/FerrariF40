import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Explicit IPv4 so the WSL2 -> Windows localhost forwarding is reliable.
  server: { host: '127.0.0.1', port: 5173 },
});
