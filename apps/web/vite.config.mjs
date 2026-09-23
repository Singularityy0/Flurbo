import { defineConfig } from 'vite';
import { localApi } from './server/local-api.mjs';

export default defineConfig({
  plugins: [{ name: 'flurbo-local-workspace', configureServer(server) { server.middlewares.use(localApi()); } }],
});
