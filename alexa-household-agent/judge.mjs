// Runs the real planner with synthetic data; no network, files, or browser state.
import assert from 'node:assert/strict';
import {seed, plan, load, save} from './engine.mjs';

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}
check('Pantry dinner costs $0 and retains pickup', () => {
  const s = plan(seed(), 'dinner');
  assert.equal(s.last.status, 'ready');
  assert.equal(s.last.cost, 0);
  assert.equal(s.events.length, 3);
  assert.equal(s.events[0].time, '18:00');
});
check('Empty pantry produces a $9 shopping draft', () => {
  const s = plan({...seed(), pantry: []}, 'dinner');
  assert.equal(s.last.cost, 9);
  assert.equal(s.last.title, 'Chickpea wraps');
  assert.equal(s.events.length, 4);
});
check('Impossible budget removes old evening steps', () => {
  const before = plan({...seed(), pantry: []}, 'dinner');
  const after = plan({...before, budget: 0}, 'dinner');
  assert.equal(after.last.status, 'blocked');
  assert.equal(after.events.length, 0);
});
check('Saved outage recovers once after reload and repeated retry', () => {
  const data = new Map();
  const storage = {getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)};
  const failed = plan({...seed(), pantry: [], outage: true}, 'dinner');
  assert.equal(failed.last.status, 'retry');
  assert.equal(failed.events.length, 0);
  save(storage, failed);
  let recovered = plan({...load(storage), outage: false}, 'dinner');
  recovered = plan(recovered, 'dinner');
  assert.equal(recovered.last.status, 'ready');
  assert.equal(recovered.events.length, 4);
  assert.equal(new Set(recovered.events.map(e => e.id)).size, 4);
  data.clear();
});
check('New dinner clears stale shopping and preserves morning', () => {
  let s = plan(seed(), 'morning');
  const morning = structuredClone(s.events);
  s = plan({...s, pantry: []}, 'shopping');
  assert.equal(s.events.filter(e => e.goal === 'shopping').length, 1);
  s = plan({...s, pantry: seed().pantry}, 'dinner');
  assert.equal(s.events.filter(e => e.goal === 'shopping').length, 0);
  assert.deepEqual(s.events.filter(e => e.goal === 'morning'), morning);
});
console.log(JSON.stringify({status: 'passed', scenarios: checks.length,
  evidence: checks, limits: 'Synthetic planner checks only. No browser UI, live Amazon integration, real household outcomes, or contest receipt.'}, null, 2));
