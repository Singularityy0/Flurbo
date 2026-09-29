import { configureCollection } from './pilot-config.mjs';

export const practiceNamespace = pool => {
  if (typeof pool !== 'string' || !/^0x[0-9a-f]{40}$/.test(pool)) throw Error('Invalid practice pool');
  return `practice-${pool.slice(2)}`;
};

// Every practice collection is registered explicitly. Each one is addressed only by its
// pool-derived namespace, so removing a collection never repoints an old link to another pool.
export async function configurePracticeCollections({env=process.env,rpcUrl,command}) {
  const extras=env.FLURBO_PRACTICE_COLLECTIONS_JSON===undefined?[]:JSON.parse(env.FLURBO_PRACTICE_COLLECTIONS_JSON);
  if(!Array.isArray(extras)||extras.length>8)throw Error('At most eight practice collections are supported');
  const services=new Map(),entries=[],pools=new Set(),resolvers=new Set();
  for(const row of extras){
    if(!row||Object.keys(row).sort().join(',')!=='label,manifest'||typeof row.label!=='string'||! /^[A-Za-z0-9][A-Za-z0-9 ()-]{2,59}$/.test(row.label))throw Error('Invalid practice collection entry');
    const service=await configureCollection({manifest:row.manifest,rpcUrl,command});
    const {manifest}=service,namespace=practiceNamespace(manifest.pool);
    if(pools.has(manifest.pool)||resolvers.has(manifest.resolver)||entries.some(e=>e.label===row.label))throw Error('Duplicate practice collection');
    pools.add(manifest.pool);resolvers.add(manifest.resolver);services.set(namespace,service);
    entries.push({namespace,label:row.label,pool:manifest.pool,closesAt:manifest.publication.draft.closesAt});
  }
  const featured=env.FLURBO_PRACTICE_ACTIVE_POOL===undefined?entries[0]?.pool:env.FLURBO_PRACTICE_ACTIVE_POOL;
  const selected=entries.find(e=>e.pool===featured);
  if(entries.length&&!selected)throw Error('Featured practice pool must be a registered collection');
  return {services,catalog:{schema:'flurbo.practice-collections.v1',active:selected?.namespace??null,collections:entries}};
}
