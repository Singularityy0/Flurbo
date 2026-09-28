import { defineConfig } from 'vite';
import { localApi } from './server/local-api.mjs';

export default defineConfig({
  plugins: [{ name: 'flurbo-local-workspace', configureServer(server) { server.middlewares.use(localApi()); } }],
  // Signed-in pages load on demand; styles stay in one file so every page keeps
  // the shared rules it relies on, whichever page loads first.
  build: { cssCodeSplit: false },
});
