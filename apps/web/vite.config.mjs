import { defineConfig, loadEnv } from 'vite';
import { localApi } from './server/local-api.mjs';
import { envioProxy } from './server/envio-proxy.mjs';
import { configurePracticeCollections } from './server/practice-collections.mjs';
import { registryEnabled } from './server/collection-registry.mjs';
import { TESTNET } from './server/network.mjs';

export default defineConfig(async ({ command, mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(localEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const useRegistry = command === 'serve' && registryEnabled();
  const rpcUrl = useRegistry ? process.env.FLURBO_ALCHEMY_TESTNET_RPC_URL || TESTNET.rpc : undefined;
  const practiceCollections = useRegistry ? await configurePracticeCollections({ rpcUrl }) : null;
  const envioUrl = process.env.FLURBO_ENVIO_GRAPHQL_URL;
  return {
    plugins: [{ name: 'flurbo-local-workspace', configureServer(server) {
      const port = server.config.server.port || 18767;
      server.middlewares.use('/envio', (req, res) => { void envioProxy(req, res, envioUrl); });
      server.middlewares.use(localApi({
        hosts: [`localhost:${port}`, `127.0.0.1:${port}`],
        ...(useRegistry ? { rpcUrl, practiceCollections, networkMode: 'public_testnet' } : {})
      }));
    } }],
    // Signed-in pages load on demand; styles stay in one file so every page keeps
    // the shared rules it relies on, whichever page loads first.
    build: { cssCodeSplit: false },
  };
});
