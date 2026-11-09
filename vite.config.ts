import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
  // Production is served from GitHub Pages at https://abcassim04.github.io/LaFerrari/
  // (a case-sensitive subpath); the dev server stays at the root. `vite preview` runs as
  // 'serve' too, so it is named here to serve the build at the same subpath.
  base: command === 'build' || isPreview ? '/LaFerrari/' : '/',
  plugins: [react()],
  // Explicit IPv4 so the WSL2 -> Windows localhost forwarding is reliable.
  server: { host: '127.0.0.1', port: 5173 },
}));
