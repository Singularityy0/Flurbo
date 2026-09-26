import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkAgentRedis} from '../scripts/check-agent-redis.mjs';
import {agentRedis} from './agent-fixture.ts';

// The rollout check itself, run against the in-process fake. This proves the check's own logic and that
// it cleans up; it does not replace running it against a real Redis-compatible test database.
test('the Redis rollout check passes on the emulated store, stays in the agent namespace and cleans up',async()=>{
  const redis=agentRedis(),lines:string[]=[];
  await redis.set('flurbo:monitor:v1:keep','untouched');
  const results=await checkAgentRedis(redis.command,(line:string)=>lines.push(line));
  assert.deepEqual(results.filter(([,passed])=>!passed),[],lines.join('\n'));
  assert.ok(results.length>=8);
  assert.deepEqual(await redis.keys(),['flurbo:monitor:v1:keep'],'only the unrelated key remains');
  const broken=await checkAgentRedis(async()=>null);
  assert.ok(broken.some(([,passed])=>!passed),'a store that ignores commands is reported as failing');
});
