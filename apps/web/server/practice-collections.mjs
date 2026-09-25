import { readFile } from 'node:fs/promises';
import { configureRehearsal,configureCollection } from './pilot-config.mjs';

export const practiceNamespace = pool => {
  if (typeof pool !== 'string' || !/^0x[0-9a-f]{40}$/.test(pool)) throw Error('Invalid practice pool');
  return `practice-${pool.slice(2)}`;
};

// The legacy rehearsal alias never follows the featured collection. Old APKs,
// bookmarks, checkout drafts, pending receipts and monitor jobs keep their pool.
export async function configurePracticeCollections({env=process.env,rpcUrl,command,rehearsal,read=readFile}) {
  const original=JSON.parse(await read(new URL('../../../config/practice-rehearsal.json',import.meta.url),'utf8'));
  const legacy=rehearsal||await configureRehearsal({env:{FLURBO_REHEARSAL_MANIFEST_JSON:JSON.stringify(original)},rpcUrl,command});
  for(const key of ['pool','resolver','rulesHash','draftHash']){
    if(legacy.manifest[key]!==original[key])throw Error('The rehearsal alias is permanent. Register a new practice collection instead.');
  }
  const extras=env.FLURBO_PRACTICE_COLLECTIONS_JSON===undefined?[]:JSON.parse(env.FLURBO_PRACTICE_COLLECTIONS_JSON);
  if(!Array.isArray(extras)||extras.length>8)throw Error('At most eight additional practice collections are supported');
  const services=new Map([['rehearsal',legacy]]);
  const entries=[{namespace:'rehearsal',label:'September practice',pool:original.pool,closesAt:original.publication.draft.closesAt}];
  const pools=new Set([original.pool]),resolvers=new Set([original.resolver]);
  for(const row of extras){
    if(!row||Object.keys(row).sort().join(',')!=='label,manifest'||typeof row.label!=='string'||! /^[A-Za-z0-9][A-Za-z0-9 ()-]{2,59}$/.test(row.label))throw Error('Invalid practice collection entry');
    const service=await configureCollection({manifest:row.manifest,rpcUrl,command});
    const {manifest}=service,namespace=practiceNamespace(manifest.pool);
    if(pools.has(manifest.pool)||resolvers.has(manifest.resolver)||entries.some(e=>e.label===row.label))throw Error('Duplicate practice collection');
    pools.add(manifest.pool);resolvers.add(manifest.resolver);services.set(namespace,service);
    entries.push({namespace,label:row.label,pool:manifest.pool,closesAt:manifest.publication.draft.closesAt});
  }
  const featured=env.FLURBO_PRACTICE_ACTIVE_POOL===undefined?original.pool:env.FLURBO_PRACTICE_ACTIVE_POOL;
  const selected=entries.find(e=>e.pool===featured);
  if(!selected)throw Error('Featured practice pool must be a registered collection');
  return {services,legacy,catalog:{schema:'flurbo.practice-collections.v1',active:selected.namespace,collections:entries}};
}
