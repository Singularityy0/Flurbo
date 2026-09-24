import { readFile } from 'node:fs/promises';
import { pilotService, pilotRpc } from './pilot.mjs';
import { pilotIndex } from './pilot-index.mjs';

// Public deployment data only. Explicit overrides are validated and never silently
// replaced by another market. Disabling access does not stop on-chain deadlines.
export async function configurePilot({env=process.env,rpcUrl,command,read=readFile}) {
  if(env.FLURBO_PILOT_DISABLED !== undefined && !['true','false'].includes(env.FLURBO_PILOT_DISABLED)) throw new Error('Invalid pilot disable setting');
  if(env.FLURBO_PILOT_DISABLED === 'true') return null;
  const raw=env.FLURBO_PILOT_MANIFEST_JSON !== undefined
    ? env.FLURBO_PILOT_MANIFEST_JSON
    : await read(new URL('../../../config/pilot-testnet.json',import.meta.url),'utf8');
  const service=pilotService({manifest:JSON.parse(raw),rpc:pilotRpc(rpcUrl)});
  if(service.manifest.publication.mode==='rehearsal')throw new Error('Rehearsal cannot replace the real pilot');
  service.index=pilotIndex({manifest:service.manifest,rpc:pilotRpc(rpcUrl),command});
  return service;
}

export async function configureRehearsal({env=process.env,rpcUrl,command}) {
  if(env.FLURBO_REHEARSAL_MANIFEST_JSON===undefined)return null;
  const manifest=JSON.parse(env.FLURBO_REHEARSAL_MANIFEST_JSON);
  if(manifest.publication?.mode!=='rehearsal'||manifest.publication.draft?.title!=='Public rehearsal: scripted settlement checks')throw new Error('Verified scripted rehearsal required');
  const service=pilotService({manifest,rpc:pilotRpc(rpcUrl)});
  service.index=pilotIndex({manifest,rpc:pilotRpc(rpcUrl),command});
  return service;
}
