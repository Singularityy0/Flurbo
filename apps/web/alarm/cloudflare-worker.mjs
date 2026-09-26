// Scheduled edge entry for the settlement alarm. NOT DEPLOYED. Activation requires an explicit
// decision, a dedicated GitHub token and wrangler.example.toml copied and reviewed.
// Required bindings: FLURBO_ALARM_CONFIG_JSON (public config), FLURBO_ALARM_GITHUB_TOKEN (secret).
// Optional: FLURBO_ALARM_RPC_URL (public endpoint only; the alarm needs no private RPC).
import { alarmConfig, alarmTick, githubActions, jsonRpc } from '../server/settlement-alarm.mjs';

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const config = alarmConfig(JSON.parse(env.FLURBO_ALARM_CONFIG_JSON));
        const github = githubActions({ repository: config.repository, token: env.FLURBO_ALARM_GITHUB_TOKEN,
          monitorWorkflow: config.monitorWorkflow, workerWorkflow: config.workerWorkflow });
        const result = await alarmTick({ config, rpc: jsonRpc(env.FLURBO_ALARM_RPC_URL || 'https://testnet-rpc.monad.xyz'),
          github, dispatch: env.FLURBO_ALARM_DISPATCH === 'true' });
        console.log(JSON.stringify(result));
      } catch {
        // Never log configuration or token material.
        console.log(JSON.stringify({ action: 'alarm-failed', message: 'Configuration or runtime failure. Details withheld.' }));
      }
    })());
  },
};
